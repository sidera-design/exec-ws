# exec-ws
Convert the path to a relative path for the workspace and execute the command within the workspace.

# Install

```sh
npm install -D exec-ws
```

# Usage

Call the command by defining the command to be executed and the file in the workspace as arguments.

Detect the file in the workspace from the arguments, convert it to a relative path in the workspace, and execute the command in the workspace.

```sh
npx exec-ws {command} {file in workspace}

# (convert to the following)

cd {workspase root}
{command} {file relative path in workspace}
```


If the arguments include files from other workspaces, execute them in separate workspaces.

```sh
npx exec-ws {command} {file-a in workspace-A} {file-b in workspace-B}

# (convert to the following)

cd {workspaseA root}
{command} {file-a relative path in workspace-A}
cd {workspaseB root}
{command} {file-b relative path in workspace-B}
```

# Setup

When executing linter and formatter with pre-commit, you can configure the following settings to coexist with Python tools.

Example: .pre-commit-config.yaml
```yaml
repos:
  - repo: local
    hooks:
      - id: rye-lint
        name: Rye lint
        entry: rye lint
        language: system
        types: [python]
        description: "Run Python linter"

      - id: rye-fmt
        name: Rye fmt
        entry: rye fmt
        language: system
        types: [python]
        description: "Run Python formatter"

      - id: ts-lint
        name: ESlint (frontend)
        entry: npx exec-ws npx eslint --fix
        language: system
        files: '\.(tsx?|jsx?)$'
        description: "Run Node.js linter"

      - id: ts-fmt
        name: Prettier (frontend)
        entry: npx exec-ws npx prettier --write
        language: system
        files: '^frontend/.*\.(tsx?|jsx?|css|json|html)$'
        description: "Run Node.js formatter"
```