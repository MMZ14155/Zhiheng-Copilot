# 一键构建并启动智衡 Copilot
# 用法: .\build-and-start.ps1
# 说明: 构建前端生产包，后台启动 Docker 服务，然后在前台启动前端预览，Ctrl+C 退出时自动停止后端。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

Write-Host '==> 构建前端生产包...' -ForegroundColor Cyan
Set-Location client
npm run build
Set-Location $root

Write-Host '==> 启动后端服务...' -ForegroundColor Cyan
docker compose up --build -d

Write-Host '==> 启动完成' -ForegroundColor Green
Write-Host '   API:      http://localhost:8086' -ForegroundColor Gray
Write-Host '   DB:       http://localhost:8088' -ForegroundColor Gray
Write-Host '   前端预览: http://localhost:4173' -ForegroundColor Gray
Write-Host '   公网访问: http://<服务器IP>:4173（预览已绑定 0.0.0.0）' -ForegroundColor Gray
Write-Host '   按 Ctrl+C 退出前端预览，后端服务将自动停止。' -ForegroundColor Gray

try {
    Set-Location "$root\client"
    npm run preview -- --host
} finally {
    Set-Location $root
    Write-Host '==> 停止后端服务...' -ForegroundColor Cyan
    docker compose down
}