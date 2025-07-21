#!/usr/bin/env node

import path from "path";
import fs from "fs";
import * as glob from "glob";
import { spawnSync } from "child_process";

// Get the command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error("Usage: exec-ws <command>");
    process.exit(1);
}

// Get the workspace root
const projectRoot = process.cwd();

// Load the root package.json
const loadPackageJson = () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    try {
        return require(packageJsonPath);
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
        process.exit(1);
    }
};
const packageJson = loadPackageJson();

// Get workspaces
const workspaces: string[] = packageJson.workspaces || []
const workspacePaths: string[] = []

for (const ws of workspaces) {
    // resolve the glob pattern relative to the workspace root
    const pattern = path.join(projectRoot, ws)
    // find all matching directories
    const matches = glob.sync(pattern)
    for (const match of matches) {
        if (fs.existsSync(match) && fs.statSync(match).isDirectory()) {
            workspacePaths.push(path.relative(projectRoot, match))
        }
    }
}

console.log(`Workspaces: ${workspacePaths.join(", ")}`)

const command = args[0];
const execArgs = args.slice(1);

for (const workspacePath of workspacePaths) {
    // Skip if the command args don't contain the workspace path
    if (!execArgs.some(arg => arg === workspacePath || arg.startsWith(`${workspacePath}/`))) {
        console.log(`==> [${workspacePath}] Skip`);
        continue;
    }
    const workspaceRoot = path.resolve(projectRoot, workspacePath)

    // Build the command arguments for this workspace
    const commandArgs: string[] = []
    for (const arg of execArgs) {

        // detect if this looks like a path
        const isPath = path.isAbsolute(arg) || arg.startsWith(".") || arg.includes(path.sep)
        if (!isPath) {
            commandArgs.push(arg)
            continue
        }

        // resolve to absolute against the workspace root
        const abs = path.isAbsolute(arg) ? arg : path.resolve(projectRoot, arg)

        // skip if it's inside any other workspace
        const otherRoots = workspacePaths
            .filter(p => p !== workspacePath)
            .map(p => path.resolve(projectRoot, p))
        if (otherRoots.some(root => abs === root || abs.startsWith(root + path.sep))) {
            continue
        }

        // if it's inside this workspace, make it relative
        if (abs === workspaceRoot || abs.startsWith(workspaceRoot + path.sep)) {
            commandArgs.push(path.relative(workspaceRoot, abs))
        } else {
            // otherwise leave it as given
            commandArgs.push(arg)
        }
    }

    // run the command in that workspace
    const cwd = path.resolve(projectRoot, workspacePath)
    console.log(`\n==> [${workspacePath}] ${command} ${commandArgs.join(" ")}`)
    const result = spawnSync(command, commandArgs, { stdio: "inherit", cwd })
    if (result.status !== 0) process.exit(result.status)
}
