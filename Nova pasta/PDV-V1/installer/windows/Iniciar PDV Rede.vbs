Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & Replace(WScript.ScriptFullName, "Iniciar PDV Rede.vbs", "Start-PDV.ps1") & """ -Mode Network", 0, False
