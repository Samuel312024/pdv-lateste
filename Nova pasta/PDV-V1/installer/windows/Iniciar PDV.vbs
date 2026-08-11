Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & Replace(WScript.ScriptFullName, "Iniciar PDV.vbs", "Start-PDV.ps1") & """ -Mode Local", 0, False
