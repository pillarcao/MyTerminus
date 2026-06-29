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

项目的构建分为**代码编译**与**应用打包**两个阶段。

1. **代码编译 (Compilation)**
   - **前端编译**：使用 Vite 将 React 源代码编译并压缩到 `dist/renderer` 目录。
     ```bash
     npm run build:vite
     ```
   - **主进程编译**：使用 TypeScript 编译器 (`tsc`) 将 Electron 主进程代码编译到 `dist/main` 目录。
     ```bash
     npm run build:electron
     ```
   - **一键全编译**：
     ```bash
     npm run build
     ```

2. **应用打包 (Packaging)**
   我们使用 `electron-builder` 将编译好的代码封装成各平台的安装程序。执行打包命令前会自动触发一次全量构建。

   - **打包 macOS 安装包 (.dmg)**：
     ```bash
     npm run package:mac
     ```
   - **打包 Windows 安装包 (.exe)**：
     ```bash
     npm run package:win
     ```
   - **全平台一键打包**：
     ```bash
     npm run package
     ```

3. **产物位置**
   打包完成后，最终的安装包（.dmg 或 .exe）将输出到项目根目录下的 **`dist_electron`** 文件夹中。

#### 跨平台打包注意
- 通常建议在对应的操作系统上进行打包（如在 Mac 上打 DMG，在 Win 上打 EXE）。
- 若在 Mac 上跨平台打包 Windows，需预先安装 `wine` 环境以支持 Windows 资源的封装。

## 快速指南

### 1. 终端主题与毛玻璃深度配置 (类 Ghostty 风格)
我们引入了强大的外部配置文件系统，无需修改代码即可完全自定义你的终端和界面：
- **全局外观 (Appearance)**：点击顶栏右上角的 🎨 (调色盘图标)，将自动打开 `appearance.conf`。你可以精准控制侧边栏、顶栏、弹窗的毛玻璃模糊半径 (`blur-*`)，以及全局界面的饱和度与色调。
- **自定义终端主题**：在编辑连接对话框的“终端主题”下拉菜单旁，点击 📁 (文件夹图标) 可直达 `themes` 目录。
    - 所有的 15+ 款内置主题（如 Nord, Catppuccin, Dracula）都会以 `.conf` 文件的形式暴露在此。
    - 只要新建 `.conf`，填入 `key = value` (支持 26 种 xterm 颜色以及 Alpha 通道控制的终端背景透明度)，即可实时在应用内加载生效！
- **透明度独立解耦**：终端画布有自己的透明度，而包裹终端的 UI 面板（Glass 侧边栏和 Header）有各自独立的毛玻璃透明度，互不干扰！

### 2. 命令分发 (Command Bar)
点击顶栏右侧的键盘图标 ⌨️ 呼出底部的**命令发送栏**：
- **目标选择**：下拉选择“当前标签”或“全部已打开标签”。
- **多行编辑**：支持 Shift+Enter 换行。
- **发送**：按 Enter 直接广播指令。

### 3. SFTP 隐藏文件
在 SFTP 工具栏中，点击“👀”图标可快速切换隐藏文件的显示状态。

## 配置文件位置

应用的所有配置都保存在系统的**用户数据目录**下，卸载或重装应用不会自动清除（如需彻底清理可手动删除该目录）。

各平台的基础目录如下（`<用户数据目录>`）。安装版与开发模式（`npm run dev`）统一使用 `MyTerminus`：

| 平台 | 目录 |
|------|------|
| **macOS** | `~/Library/Application Support/MyTerminus/` |
| **Windows** | `%APPDATA%\MyTerminus\`（即 `C:\Users\<用户名>\AppData\Roaming\MyTerminus\`） |
| **Linux** | `~/.config/MyTerminus/` |

> 说明：目录名取自 package.json 的 `productName` 字段（`MyTerminus`），开发与打包一致。

目录内的文件结构：

| 路径 | 内容 |
|------|------|
| `config.json` | 连接、分组等数据（由 electron-store 管理） |
| `config/themes/*.conf` | 终端配色主题，每个主题一个 `.conf` 文件 |
| `config/appearance.conf` | 全局外观与毛玻璃参数（模糊半径、饱和度、色调等） |

**快捷入口：**
- 顶栏右上角 🎨 图标：直接打开 `appearance.conf`。
- 编辑连接对话框中“终端主题”旁的 📁 图标：直接打开 `config/themes` 目录。

## 技术规格

- **核心架构**：Electron 28 + TSX
- **界面引擎**：React 18 + Vanilla CSS (Premium Design System)
- **底层通信**：ssh2, xterm.js
- **安全性**：机密信息在本地加密存储。

---

*版本：1.1.0 | 更新日期：2026-04-17*