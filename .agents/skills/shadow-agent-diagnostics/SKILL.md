---
name: shadow-agent-diagnostics
description: >-
  Runbook for inspecting, diagnosing, and verifying the execution status of the shadow_agent python application and Windows Task Scheduler tasks.
  Use when checking if shadow_agent is active, examining python process states, task history, or compiled bytecode cache.
---

# Shadow Agent Diagnostics Runbook

This skill outlines the diagnostic steps to inspect the `shadow_agent` application located at `C:\shadow_agent_publish\shadow_agent_publish`.

---

## 🔍 Application Location & Files

* **Directory:** `C:\shadow_agent_publish\shadow_agent_publish`
* **Core Script:** `shadow_agent_prod.py`
* **Launcher Script:** [`C:\shadow_agent_publish\run_agent.bat`](file:///C:/shadow_agent_publish/run_agent.bat)
* **Config Files:** `shadow_agent_config.json`, `config.json`
* **Bytecode Cache:** `__pycache__\shadow_agent_prod.cpython-314.pyc`

---

## 🛠️ Diagnostic Verification Steps

### 1. Check Active Running Processes
Run PowerShell query to see if any `shadow_agent` or `pythonw.exe` process is active:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shadow*' -or $_.ExecutablePath -like '*shadow*' } | Select-Object ProcessId, Name, ExecutablePath, CommandLine
```

### 2. Inspect Windows Scheduled Task (`Agentic`)
Check the status, last run time, and exit code of the Windows Task Scheduler job:

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -eq 'Agentic' } | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
    [PSCustomObject]@{
        TaskName       = $_.TaskName
        State          = $_.State
        LastRunTime    = $info.LastRunTime
        LastTaskResult = $info.LastTaskResult
        NextRunTime    = $info.NextRunTime
    }
}
```

### 3. Check File Modification Timestamps
Review when config files or bytecode cache were last modified to verify when the agent last compiled or ran:

```powershell
Get-ChildItem -Path 'C:\shadow_agent_publish' -Recurse | Select-Object LastWriteTime, Length, FullName | Sort-Object LastWriteTime -Descending | Select-Object -First 20
```

---

## ⚠️ Important Operating Rules
* **Never auto-start `shadow_agent`** without explicit user permission.
* Status checks should be read-only using process queries and Task Scheduler inspection.
