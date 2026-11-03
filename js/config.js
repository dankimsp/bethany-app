/* Editable app settings. Fill the placeholder URLs when they exist.
   Never put a team code, password, or hash in this file. */
var BETHANY = {
  church: "Bethany Church",
  address: "15414 Ash Way, Lynnwood, WA 98087",
  shortAddress: "15414 Ash Way",
  phone: "(206) 551-7321",
  watchUrl: "https://www.youtube.com/@bethanychurch2134/streams",
  sermonNotesUrl: "https://www.bethanychurchwa.org/blog",
  tithelyUrl: "https://tithe.ly/give_new/www/#/tithely/give-one-time/1412967",
  tithelyIos: "https://apps.apple.com/us/app/tithe-ly/id694740700",
  tithelyAndroid: "https://play.google.com/store/apps/details?id=ly.tithe.tithely&hl=en",
  venmoHandle: "@Bethany_IMPACT",
  venmoUrl: "https://venmo.com/u/Bethany_IMPACT",
  checkPayable: "Bethany Church",
  checkMemo: "For general offering, the memo line can be left blank. To give to a specific missionary or missional purpose, write where the gift should go in the memo line.",
  feedbackUrl: "",
  mapsUrl: "https://maps.google.com/?q=15414+Ash+Way,+Lynnwood,+WA+98087"
};

var BETHANY_WEEKLY = [
  { day: 0, name: "English (EM) Service", ko: "영어 예배 (EM)", h: 10, m: 0, live: true },
  { day: 0, name: "Korean Service", ko: "한국어 예배", h: 11, m: 30, live: true },
  { day: 0, name: "Youth Bible Study", ko: "청소년 성경공부", h: 11, m: 40, live: false },
  { day: 2, name: "Women's Bible Study", ko: "여성 성경공부", h: 18, m: 30, live: false },
  { day: 3, name: "Korean Service", ko: "수요 한국어 예배", h: 19, m: 0, live: true },
  { day: 3, name: "Men's Bible Study", ko: "남성 성경공부", h: 19, m: 15, live: false },
  { day: 6, name: "Morning Prayer (Korean)", ko: "새벽 기도 (한국어)", h: 7, m: 0, live: false },
  { day: 6, name: "Young Adult Men's Bible Study", ko: "청년 남성 성경공부", h: 19, m: 0, live: false }
];

/* Add one-time events here. rsvp: true shows the existing RSVP form. */
var BETHANY_EVENTS = [
  { id: "thanks-2026", title: "Thanksgiving Fellowship Lunch", ko: "추수감사절 친교 점심", date: "2026-11-22", time: "12:45", note: "after services", koNote: "예배 후", rsvp: false }
];

/* New ministries are added here, in code, not by a button in the app. */
var BETHANY_MINISTRIES = [
  {
    id: "worship",
    name: "Worship Team",
    ko: "찬양팀",
    blurb: "Chord sheets, setlists, and who can serve",
    koBlurb: "악보, 셋리스트, 섬김 가능 여부",
    code: true,
    icon: "music",
    tools: [
      { id: "chords", name: "Chord sheets", ko: "악보", href: "#/worship/library", hint: "Sharps only · fit to screen" },
      { id: "setlists", name: "Setlists", ko: "셋리스트", href: "#/worship/setlists", hint: "This Sunday" },
      { id: "availability", name: "Team availability", ko: "섬김 가능", href: "#/availability", hint: "Mark the Sundays you can serve" }
    ]
  },
  {
    id: "nursery",
    name: "Nursery",
    ko: "유아부",
    blurb: "Sunday nursery sign-up",
    koBlurb: "주일 유아부 신청",
    code: true,
    icon: "smile",
    tools: [
      { id: "nursery-signup", name: "Nursery sign-up", ko: "유아부 신청", href: "#/signup/nursery", hint: "Name and Sunday" }
    ]
  },
  {
    id: "kitchen",
    name: "Food Kitchen",
    ko: "음식 사역",
    blurb: "A short description goes here.",
    koBlurb: "소개 글이 여기에 들어갑니다.",
    code: false,
    icon: "bowl",
    tools: [
      { id: "km-food", name: "KM Food Sign-up", ko: "한국어 예배 음식 신청", href: "#/signup/km-food", hint: "Name and Sunday" },
      { id: "snack", name: "EM Sunday Snack Sign-up", ko: "영어 예배 간식 신청", href: "#/signup/snack", hint: "After the 10:00 AM English service" }
    ]
  }
];

var BETHANY_ROSTER = [
  { id: "woori", name: "Pastor Woori", role: "" },
  { id: "palmy", name: "Palmy", role: "" },
  { id: "daniel", name: "Daniel", role: "" }
];

var BETHANY_I18N = {
  en: {
    home: "Home", events: "Events", ministries: "Ministries", give: "Give", more: "More",
    good: "Good", morning: "morning", afternoon: "afternoon", evening: "evening",
    next: "Next service", livePill: "In person · livestream", watch: "Watch Live", allTimes: "All times",
    upcoming: "Upcoming events", seeAll: "See all", special: "SPECIAL EVENT", addCal: "Add to calendar",
    thisWeek: "This week · weekly", sermon: "Sermon notes", sermonBody: "Read write-ups of past sermons", sermonOpen: "Opens bethanychurchwa.org",
    myMin: "My Ministry", answerOne: "1 Sunday to answer", answersSome: "Sundays to answer",
    weekly: "Weekly schedule", every: "Every week", specials: "Special events", once: "One-time",
    liveWord: "Live", where: "All at 15414 Ash Way", alsoLive: "also livestreamed",
    church: "Church", visit: "Visit & contact", visitSub: "15414 Ash Way · (206) 551-7321",
    notes: "Notifications", notesSub: "Service reminders", language: "Language", langSub: "English · 한국어",
    feedback: "Send feedback", feedbackSub: "Opens a short Google Form · 1 min",
    haveCode: "Have a team code?", serveAsk: "Serve on a team?",
    teamTitle: "Enter your team code", teamBody: "Your ministry leader shares one code with the team. It unlocks only your team's tools.",
    teamLabel: "Team code", join: "Join", onceOnly: "One time only.", onceBody: "This phone remembers your code, so you won't be asked again. No account or password needed.",
    askDaniel: "Don't have a code? Ask Daniel for your team's code.",
    toolsFor: "Tools for the teams you serve on.", unlocked: "Unlocked on this phone", joined: "Joined",
    another: "On another team too?", anotherLink: "Join another team with a code",
    who: "Who are you?", whoBody: "Pick your name once. This phone remembers it for availability.",
    continueAs: "Continue", availability: "Team availability", answering: "Answering as", change: "Change",
    saved: "Saved", saving: "Saving…", soon: "Sign-ups open soon",
    anytime: "You can change your answers anytime.", available: "Available", maybe: "Maybe", unavailable: "Unavailable",
    note: "Note", needs: "Needs answer", teamView: "Team view", myAnswers: "My answers",
    leaderView: "Leader view · Worship Team", updates: "Updates live", short: "is short",
    havent: "haven't answered", of: "of",
    find: "Find your people at Bethany.", openAll: "Open to everyone",
    kitchen: "Food Kitchen", km: "KM Food Sign-up", kmBody: "For the Korean ministry fellowship meal.",
    snack: "EM Sunday Snack Sign-up", snackBody: "After the 10:00 AM English service.",
    name: "Name", which: "Which Sunday", signUp: "Sign up", cancel: "Cancel my sign-up",
    yours: "Yours", open: "Open", taken: "Taken", you: "You",
    donation: "Want to make a snack donation instead? Contact Jennifer.",
    several: "Several people can sign up for the same Sunday.",
    giveLead: "Thank you for supporting the ministry of Bethany Church.",
    giveOnline: "Give online", giveBody: "Secure giving through Tithe.ly. Set up a one-time or recurring gift.",
    giveBtn: "Give with Tithe.ly", venmo: "Venmo", sendTo: "Send to", openVenmo: "Open Venmo",
    byCheck: "Give by check", payable: "Payable to", mailTo: "Mail to", memo: "Memo",
    serveTitle: "Serve links", servePw: "Team password", remember: "Remember on this device", unlock: "Unlock", lock: "Lock",
    wrong: "That password isn't right. Try again.", wrongCode: "That code isn't right.",
    notifOn: "Reminders on this phone", notifBody: "A simple reminder switch for this device. It does not text or email anyone.",
    back: "Back", sample: "Sample", yourSignup: "Your sign-up", bringing: "signed up",
    noMinistry: "No team tools on this phone yet."
  },
  ko: {
    home: "홈", events: "행사", ministries: "사역", give: "헌금", more: "더보기",
    good: "", morning: "좋은 아침", afternoon: "안녕하세요", evening: "좋은 저녁",
    next: "다음 예배", livePill: "현장 예배 · 생중계", watch: "생중계 보기", allTimes: "전체 예배 시간",
    upcoming: "다가오는 행사", seeAll: "전체 보기", special: "특별 행사", addCal: "캘린더에 추가",
    thisWeek: "이번 주 · 정기 모임", sermon: "설교 노트", sermonBody: "지난 설교 요약 읽기", sermonOpen: "bethanychurchwa.org에서 열기",
    myMin: "내 사역", answerOne: "답변할 주일 1개", answersSome: "답변할 주일",
    weekly: "매주 일정", every: "매주", specials: "특별 행사", once: "한 번",
    liveWord: "생중계", where: "15414 Ash Way", alsoLive: "생중계도 됩니다",
    church: "교회", visit: "오시는 길", visitSub: "15414 Ash Way · (206) 551-7321",
    notes: "알림", notesSub: "예배 알림", language: "언어", langSub: "English · 한국어",
    feedback: "의견 보내기", feedbackSub: "짧은 구글 폼 · 1분",
    haveCode: "팀 코드가 있나요?", serveAsk: "팀으로 섬기나요?",
    teamTitle: "팀 코드를 입력하세요", teamBody: "사역 인도자가 팀과 코드 하나를 나눕니다. 그 팀의 도구만 열립니다.",
    teamLabel: "팀 코드", join: "참여", onceOnly: "한 번만 입력합니다.", onceBody: "이 기기가 코드를 기억합니다. 계정이나 비밀번호는 없습니다.",
    askDaniel: "코드가 없나요? Daniel에게 팀 코드를 물어보세요.",
    toolsFor: "섬기는 팀의 도구입니다.", unlocked: "이 기기에서 열림", joined: "참여함",
    another: "다른 팀도 있나요?", anotherLink: "코드로 다른 팀 참여",
    who: "누구신가요?", whoBody: "이름을 한 번 고르면 이 기기가 기억합니다.",
    continueAs: "계속", availability: "섬김 가능", answering: "답하는 사람", change: "변경",
    saved: "저장됨", saving: "저장 중…", soon: "신청이 곧 열립니다",
    anytime: "답은 언제든 바꿀 수 있습니다.", available: "가능", maybe: "아마도", unavailable: "불가",
    note: "메모", needs: "답 필요", teamView: "팀 보기", myAnswers: "내 답",
    leaderView: "인도자 보기 · 찬양팀", updates: "바로 반영", short: "인원이 적습니다",
    havent: "아직 답이 없습니다", of: "/",
    find: "베다니의 사람들을 찾아보세요.", openAll: "모두에게 열림",
    kitchen: "음식 사역", km: "한국어 예배 음식 신청", kmBody: "한국어 사역 교제 식사입니다.",
    snack: "영어 예배 간식 신청", snackBody: "오전 10시 영어 예배 후.",
    name: "이름", which: "어느 주일", signUp: "신청", cancel: "내 신청 취소",
    yours: "내 신청", open: "비어 있음", taken: "마감", you: "나",
    donation: "간식을 기부하고 싶나요? Jennifer에게 문의하세요.",
    several: "같은 주일에 여러 사람이 신청할 수 있습니다.",
    giveLead: "베다니 교회 사역을 후원해 주셔서 감사합니다.",
    giveOnline: "온라인 헌금", giveBody: "Tithe.ly로 안전하게 헌금합니다. 한 번 또는 정기 헌금을 설정할 수 있습니다.",
    giveBtn: "Tithe.ly로 헌금", venmo: "Venmo", sendTo: "받을 사람", openVenmo: "Venmo 열기",
    byCheck: "수표 헌금", payable: "수표 명의", mailTo: "우편", memo: "메모",
    serveTitle: "섬김 링크", servePw: "팀 비밀번호", remember: "이 기기에 기억", unlock: "열기", lock: "잠그기",
    wrong: "비밀번호가 맞지 않습니다.", wrongCode: "코드가 맞지 않습니다.",
    notifOn: "이 기기의 알림", notifBody: "이 기기의 스위치입니다. 문자나 이메일을 보내지 않습니다.",
    back: "뒤로", sample: "예시", yourSignup: "내 신청", bringing: "신청",
    noMinistry: "이 기기에는 아직 팀 도구가 없습니다."
  }
};
