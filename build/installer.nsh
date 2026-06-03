; Custom NSIS script — installs Microsoft Pattara Thai TTS voice
; Included by electron-builder during NSIS packaging

!macro customInstall
  ; ─── ตรวจสอบว่าติดตั้งเสียงภาษาไทยอยู่แล้วหรือไม่ ─────────────────────────
  ReadRegStr $0 HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    ""
  StrCmp $0 "" +2 0
    Goto skip_voice_install

  ; ─── สร้าง directories ─────────────────────────────────────────────────────
  CreateDirectory "$WINDIR\Speech_OneCore\Engines\TTS\th-TH\NUSData"
  CreateDirectory "$WINDIR\System32\Speech_OneCore\common\th-TH"
  CreateDirectory "$WINDIR\SysWOW64\Speech_OneCore\Common\th-TH"

  ; ─── ติดตั้งไฟล์ข้อมูลเสียง Pattara ──────────────────────────────────────
  SetOutPath "$WINDIR\Speech_OneCore\Engines\TTS\th-TH"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\M1054Pattara.apm"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\M1054Pattara.bep"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\M1054Pattara.heq"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\M1054Pattara.ini"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\MSTTSLocThTH.dat"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\MSTTSLocThTH.INI"

  SetOutPath "$WINDIR\Speech_OneCore\Engines\TTS\th-TH\NUSData"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\NUSData\M1054Pattara.keyboard.NU2"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\NUSData\M1054Pattara.keyboard.RAD"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\NUSData\M1054Pattara.keyboard.unt"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\NUSData\M1054Pattara.keyboard.WIH"
  File "${BUILD_RESOURCES_DIR}\voice-th\TTS\NUSData\M1054Pattara.keyboard.WVE"

  ; ─── ติดตั้ง tokens XML (voice discovery manifest) ────────────────────────
  SetOutPath "$WINDIR\System32\Speech_OneCore\common\th-TH"
  File "${BUILD_RESOURCES_DIR}\voice-th\common\tokens_TTS_th-TH.xml"
  SetOutPath "$WINDIR\SysWOW64\Speech_OneCore\Common\th-TH"
  File "${BUILD_RESOURCES_DIR}\voice-th\common\tokens_TTS_th-TH.xml"

  ; ─── Register voice token ใน registry ────────────────────────────────────
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    "" "Microsoft Pattara - Thai (Thailand)"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    "41E" "Microsoft Pattara - Thai (Thailand)"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    "CLSID" "{179F3D56-1B0B-42B2-A962-59B7EF59FE1B}"
  WriteRegExpandStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    "LangDataPath" "%windir%\Speech_OneCore\Engines\TTS\th-TH\MSTTSLocThTH.dat"
  WriteRegExpandStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara" \
    "VoicePath" "%windir%\Speech_OneCore\Engines\TTS\th-TH\M1054Pattara"

  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Age" "Adult"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "DataVersion" "11.0.2016.1016"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Gender" "Male"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Language" "41E"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Name" "Microsoft Pattara"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "SayAsSupport" "spell=NativeSupported; alphanumeric=NativeSupported"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "SharedPronunciation" ""
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Vendor" "Microsoft"
  WriteRegStr HKLM \
    "SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_thTH_Pattara\Attributes" \
    "Version" "11.0"

  skip_voice_install:
!macroend

!macro customUninstall
  ; ไม่ลบเสียงออกเมื่อ uninstall เพราะ user อาจใช้กับโปรแกรมอื่นด้วย
!macroend
