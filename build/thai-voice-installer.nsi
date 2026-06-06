; Thai Voice Installer — installs Microsoft เปรมวดี local TTS voice
; Requires internet + must run as Administrator

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "Queue OPD — ติดตั้งเสียงภาษาไทย"
OutFile "..\\Thai-Voice-Setup.exe"
InstallDir "$TEMP\\ThaiVoiceSetup"
RequestExecutionLevel admin
ShowInstDetails show

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Thai"

Section "ติดตั้งเสียงภาษาไทย"

  DetailPrint "กำลังตรวจสอบ..."

  ; ── 1. Microsoft Pattara (offline, copy files) ──────────────────────────────
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" ""
  ${If} $0 == ""
    DetailPrint "ติดตั้ง Microsoft Pattara (Thai Male)..."
    CreateDirectory "$WINDIR\Speech_OneCore\Engines\TTS\th-TH\NUSData"
    CreateDirectory "$WINDIR\System32\Speech_OneCore\common\th-TH"
    CreateDirectory "$WINDIR\SysWOW64\Speech_OneCore\Common\th-TH"

    SetOutPath "$WINDIR\Speech_OneCore\Engines\TTS\th-TH"
    File "${NSISDIR}\..\build\voices\th-TH\M1054Pattara.apm"
    File "${NSISDIR}\..\build\voices\th-TH\M1054Pattara.bep"
    File "${NSISDIR}\..\build\voices\th-TH\M1054Pattara.heq"
    File "${NSISDIR}\..\build\voices\th-TH\M1054Pattara.ini"
    File "${NSISDIR}\..\build\voices\th-TH\MSTTSLocThTH.dat"
    File "${NSISDIR}\..\build\voices\th-TH\MSTTSLocThTH.INI"

    SetOutPath "$WINDIR\Speech_OneCore\Engines\TTS\th-TH\NUSData"
    File "${NSISDIR}\..\build\voices\th-TH\NUSData\M1054Pattara.keyboard.NU2"
    File "${NSISDIR}\..\build\voices\th-TH\NUSData\M1054Pattara.keyboard.RAD"
    File "${NSISDIR}\..\build\voices\th-TH\NUSData\M1054Pattara.keyboard.unt"
    File "${NSISDIR}\..\build\voices\th-TH\NUSData\M1054Pattara.keyboard.WIH"
    File "${NSISDIR}\..\build\voices\th-TH\NUSData\M1054Pattara.keyboard.WVE"

    SetOutPath "$WINDIR\System32\Speech_OneCore\common\th-TH"
    File "${NSISDIR}\..\build\voices\common-th\tokens_TTS_th-TH.xml"
    SetOutPath "$WINDIR\SysWOW64\Speech_OneCore\Common\th-TH"
    File "${NSISDIR}\..\build\voices\common-th\tokens_TTS_th-TH.xml"

    WriteRegStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" "" "Microsoft Pattara - Thai (Thailand)"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" "CLSID" "{179F3D56-1B0B-42B2-A962-59B7EF59FE1B}"
    WriteRegExpandStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" "VoicePath" "%windir%\Speech_OneCore\Engines\TTS\th-TH\M1054Pattara"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" "Language" "41E"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" "Name" "Microsoft Pattara"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" "Vendor" "Microsoft"
    DetailPrint "✓ Pattara ติดตั้งแล้ว"
  ${Else}
    DetailPrint "✓ Pattara มีอยู่แล้ว — ข้าม"
  ${EndIf}

  ; ── 2. Microsoft เปรมวดี — ดาวน์โหลดจาก Windows Update ─────────────────────
  DetailPrint "กำลังติดตั้ง Microsoft เปรมวดี Thai Natural Voice..."
  DetailPrint "(ต้องการ internet — อาจใช้เวลา 1-3 นาที)"
  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Add-WindowsCapability -Online -Name ''Language.TextToSpeech~~~th-TH~0.0.1.0''"'
  Pop $1
  ${If} $1 == 0
    DetailPrint "✓ เปรมวดี ติดตั้งสำเร็จ"
  ${Else}
    DetailPrint "⚠ เปรมวดี: ติดตั้งไม่สำเร็จ (รหัส $1) — ตรวจสอบการเชื่อมต่อ internet"
  ${EndIf}

  DetailPrint ""
  DetailPrint "เสร็จสิ้น — รีสตาร์ทโปรแกรม Queue OPD แล้วเลือกเสียงไทยได้เลย"

SectionEnd
