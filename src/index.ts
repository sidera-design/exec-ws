#!/usr/bin/env node

import path from "path";

// コマンドライン引数を取得
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: exec-ws <command>");
  process.exit(1);
}

// ワークスペースのルートを取得
const workspaceRoot = process.cwd();

// コマンドを実行
const command = args.join(" ");
console.log(`Executing command in workspace: ${workspaceRoot}`);
console.log(`Command: ${command}`);

// 実際のコマンド実行ロジックをここに追加