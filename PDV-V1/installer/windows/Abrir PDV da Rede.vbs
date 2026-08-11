Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & Replace(WScript.ScriptFullName, "Abrir PDV da Rede.vbs", "Start-PDV.ps1") & """ -Mode Client", 0, False
