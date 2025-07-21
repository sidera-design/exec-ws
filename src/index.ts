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

    let resultCode = 0;
    await Promise.all(workspacePaths.map(async (workspacePath) => {
        // Skip if the command args don't contain the workspace path
        if (!changeArgs.some(arg => arg === workspacePath || arg.startsWith(`${workspacePath}/`))) {
            console.log(`>> Workspace [${workspacePath}] skips command.`);
            return;
        }

        // Build the command arguments for this workspace
        const resolvedArgs = resolveArgs(changeArgs, workspacePaths, workspacePath);
        const execArgs = [...fixedArgs, ...resolvedArgs];
        const cwd = path.resolve(projectRoot, workspacePath);

        console.log(`>> Workspace [${workspacePath}] calls: ${command} ${execArgs.join(" ")}`);

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
 * Parse a command string into its components
 * @param input The command string to parse
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
 * @param changeArgs The arguments to resolve
 * @param workspacePaths The paths of all workspaces
 * @param targetPath The target workspace path
 * @returns An array of resolved command arguments
 */
function resolveArgs(changeArgs: string[], workspacePaths: string[], targetPath: string) {
    const commandArgs: string[] = [];
    const workspaceRoot = path.resolve(projectRoot, targetPath)

    for (const arg of changeArgs) {

        // detect if this looks like a path
        const isPath = path.isAbsolute(arg) || arg.startsWith(".") || arg.includes(path.sep);
        if (!isPath) {
            commandArgs.push(arg);
            continue;
        }

        // resolve to absolute against the workspace root
        const abs = path.isAbsolute(arg) ? arg : path.resolve(projectRoot, arg);

        // skip if it's inside any other workspace
        const otherRoots = workspacePaths
            .filter(p => p !== targetPath)
            .map(p => path.resolve(projectRoot, p));
        if (otherRoots.some(root => abs === root || abs.startsWith(root + path.sep))) {
            continue;
        }

        // if it's inside this workspace, make it relative
        if (abs === workspaceRoot || abs.startsWith(workspaceRoot + path.sep)) {
            commandArgs.push(path.relative(workspaceRoot, abs) || ".");
        } else {
            // otherwise leave it as given
            commandArgs.push(arg);
        }
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
