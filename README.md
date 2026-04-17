# MyTerminus SSH/SFTP 客户端使用手册

## 概述

MyTerminus 是一个基于 Electron + TypeScript 开发的高级 SSH/SFTP 桌面客户端。它不仅专注于团队协作中的 SSH 与文件传输，更通过**现代毛玻璃（Glassmorphism）美学设计**提供了极具质感的交互体验。

## 核心特性

- **极致美学设计**：采用高饱和、深模糊的毛玻璃视觉风格，适配现代桌面潮流，支持智能深浅色切换。
- **高级 SSH 终端**：
    - 基于 xterm.js，支持真彩显示与高性能渲染。
    - **多款精选主题**：提供 Nord (Arctic), Dracula, Solarized, Synthwave (Neon), One Dark 等 10+ 种专业配色方案。
    - **自定义光标**：支持 Block, Bar, Underline 样式及闪烁设置。
- **强大的命令分发栏**：内置批处理指令栏，支持将命令一键同步发送至当前或所有已连接的终端，支持多行编辑。
- **直观的 SFTP 浏览器**：
    - 支持显示/隐藏隐藏文件（👀 开关）。
    - 文件夹/文件分级管理，支持批量操作与实时状态刷新。
- **多平台原生优化**：针对 macOS 交通灯布局与 Windows 标题栏覆盖（Title Bar Overlay）进行了原生适配。

## 系统要求

- macOS 10.12+ (支持 Apple Silicon & Intel)
- Windows 10/11+ (x64)

## 安装与使用 (Installation)

### 1. 普通用户直接安装
可以获取预先打包好的安装包直接运行：
- **macOS**: 安装 `MyTerminus-1.1.0-arm64.dmg`。
- **Windows**: 运行 `MyTerminus-1.1.0-setup.exe`。

### 2. 开发者指南 (Developer Guide)

#### 本地启动 (Development)
1. 克隆并安装依赖：`npm install`
2. 启动开发环境：`npm run dev`

#### 生产构建与打包 (Build & Package)
1. **打 macOS 安装包**：`npm run package:mac`
2. **打 Windows 安装包**：`npm run package:win`
3. **根据当前平台打包**：`npm run package`

## 快速指南

### 1. 终端主题切换
在编辑连接对话框中，你可以为每个服务器选择不同的**终端主题**。所有主题均支持**毛玻璃透明效果**，呈现出通透灵动的画面质感。

### 2. 命令分发 (Command Bar)
点击顶栏右侧的键盘图标 ⌨️ 呼出底部的**命令发送栏**：
- **目标选择**：下拉选择“当前标签”或“全部已打开标签”。
- **多行编辑**：支持 Shift+Enter 换行。
- **发送**：按 Enter 直接广播指令。

### 3. SFTP 隐藏文件
在 SFTP 工具栏中，点击“👀”图标可快速切换隐藏文件的显示状态。

## 技术规格

- **核心架构**：Electron 28 + TSX
- **界面引擎**：React 18 + Vanilla CSS (Premium Design System)
- **底层通信**：ssh2, xterm.js
- **安全性**：机密信息在本地加密存储。

---

*版本：1.1.0 | 更新日期：2026-04-17*