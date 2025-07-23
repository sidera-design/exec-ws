#!/usr/bin/env node

import path from "path";
import fs, { stat } from "fs";
import * as glob from "glob";
import { spawn } from "child_process";
import { Command } from 'commander';
import { parse } from 'shell-quote';

const projectRoot = process.cwd();


const handleCommand = async (args: string[], options: { command?: string }) => {

    if (args.length === 0) {
        process.exit(1);
    }

    // Get workspaces
    const packageJson = loadPackageJson();
    const workspacePaths: string[] = getWorkspaces(packageJson);

    console.log(`Workspaces: ${workspacePaths.join(", ")}`)

    // Set command and arguments
    const commandArgs = options.command ? parseCommand(options.command) : [];
    const command = (options.command ? commandArgs[0] : args[0]);
    const fixedArgs = commandArgs.slice(1).map(arg => arg);
    const changeArgs = options.command ? args : args.slice(1);

    const allArgs = [...fixedArgs, ...changeArgs];
    console.log(`Original command: ${command} ${allArgs.join(" ")}`);

    const assignedArgs = await assignArgs(changeArgs, workspacePaths);

    let resultCode = 0;
    await Promise.all(Object.keys(assignedArgs).map(async (workspacePath) => {
        const workspaceName = workspacePath ? `Workspace:${workspacePath}` : "<Project Root>"
        // Skip if the command args don't contain the workspace path
        if (assignedArgs[workspacePath].length === 0) {
            console.log(`>> ${workspaceName} skips command.`);
            return;
        }

        // Build the command arguments for this workspace
        const execArgs = [...fixedArgs, ...assignedArgs[workspacePath]];
        const cwd = path.resolve(projectRoot, workspacePath);

        console.log(`>> ${workspaceName} calls: ${command} ${execArgs.join(" ")}`);

        try {
            const exitCode = await new Promise<number>((resolve, reject) => {
                const child = spawn(command, execArgs, { stdio: "inherit", cwd });
                child.on("error", reject);
                child.on("close", code => resolve(code ?? 1));
            });
            if (exitCode !== 0) {
                console.error(` Failed code [${workspacePath}]: ${exitCode}`);
                resultCode = Math.max(resultCode, exitCode);
            }
        } catch (error: any) {
            console.error(` Error [${workspacePath}]: ${error.message}`);
            resultCode = Math.max(resultCode, 1);
        }
    }));
    return process.exit(resultCode);
}

/**
 * Async path existence check: returns true if file or directory exists, false on error or absence
 * @param p - The path to check
 * @returns A promise that resolves to true if the path exists, false otherwise
 */
const pathExists = async (p: string): Promise<boolean> => {
    try {
        await fs.promises.stat(p)
        return true
    } catch {
        return false
    }
}

/**
 * Parse a command string into its components
 * @param input - The command string to parse
 * @returns An array of command components
 */
const parseCommand = (input: string) => {
    const parsed = parse(input);
    return parsed.filter((part): part is string => typeof part === 'string');
}

/**
 * Load the root package.json
 * @returns The contents of the package.json file
 */
const loadPackageJson = () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    try {
        return require(packageJsonPath);
    } catch (error) {
        console.error(`Faild to load 'package.json' in ${projectRoot}:`, error);
        process.exit(1);
    }
};

/**
 * Resolve command arguments to be relative to the workspace root
 * @param changeArgs - The arguments to resolve
 * @param workspacePaths - The paths of all workspaces
 * @returns An array of resolved command arguments
 */
async function assignArgs(changeArgs: string[], workspacePaths: string[]) {
    const commandArgs: Record<string, string[]> = Object.fromEntries(
        [...workspacePaths.map(ws => [ws, []]),
        ["", []]]
    );

    for (const arg of changeArgs) {

        // check if this arg looks like a path
        const isPath = path.isAbsolute(arg) || arg.startsWith(".") || arg.includes(path.sep) || await pathExists(arg);
        if (!isPath) {
            // if args is not a path, push to all workspaces
            Object.values(commandArgs).forEach(args => {
                args.push(arg);
            });
            continue;
        }

        // resolve to absolute against the workspace root
        const abs = path.isAbsolute(arg) ? arg : path.resolve(projectRoot, arg);

        // skip if it's inside any other workspace
        const belongWorkspace = Object.keys(commandArgs).find(ws => {
            const wsAbs = path.resolve(projectRoot, ws);
            return wsAbs === abs || abs.startsWith(wsAbs + path.sep);
        }) || "";
        commandArgs[belongWorkspace].push(path.relative(belongWorkspace, abs) || ".");
    }
    return commandArgs;
}

/**
 * Get the workspace paths from the package.json
 * @param packageJson The package.json object
 * @returns An array of workspace paths
 */
function getWorkspaces(packageJson: any) {
    const workspaces: string[] = packageJson.workspaces || [];
    const workspacePaths: string[] = [];

    for (const ws of workspaces) {
        // resolve the glob pattern relative to the workspace root
        const pattern = path.join(projectRoot, ws);
        // find all matching directories
        const matches = glob.sync(pattern);
        for (const match of matches) {
            if (fs.existsSync(match) && fs.statSync(match).isDirectory()) {
                workspacePaths.push(path.relative(projectRoot, match));
            }
        }
    }
    return workspacePaths;
}



// Command line interface
const program = new Command();
const pkg = require(path.resolve(__dirname, "../package.json"));

program
    .name('exec-ws')
    .version(pkg.version)
    .option('-c, --command <string>', 'Specify command')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]', 'Arguments after command or as standalone')
    .action(handleCommand);
program.parse(process.argv);
