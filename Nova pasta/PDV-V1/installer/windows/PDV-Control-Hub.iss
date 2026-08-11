#define MyAppName "PDV Control Hub"
#define MyAppPublisher "Samuel"
#define MyAppExeName "PDV.Launcher.exe"

#ifndef SourceDir
  #define SourceDir "..\..\artifacts\pdv-setup\app"
#endif

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{F15BB91B-DF0F-4F43-8E53-F218A3F4BF4B}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\PDV Control Hub
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
DisableProgramGroupPage=yes
OutputBaseFilename=PDV-Control-Hub-Setup

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{srcexe}"; DestDir: "{commonappdata}\PDV Control Hub\downloads"; DestName: "PDV-Control-Hub-Setup.exe"; Flags: external ignoreversion

[Icons]
Name: "{group}\PDV Control Hub"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\PDV Control Hub (Rede Local)"; Filename: "{app}\{#MyAppExeName}"; Parameters: "network"
Name: "{group}\Abrir PDV da Rede"; Filename: "{app}\{#MyAppExeName}"; Parameters: "client"
Name: "{group}\Parar PDV local"; Filename: "{app}\{#MyAppExeName}"; Parameters: "stop"
Name: "{group}\Guia rapida de rede"; Filename: "notepad.exe"; Parameters: """{app}\LEIA-ME-REDE.txt"""
Name: "{group}\Desinstalar PDV Control Hub"; Filename: "{uninstallexe}"
Name: "{autodesktop}\PDV Control Hub"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir PDV agora"; Flags: nowait postinstall skipifsilent
