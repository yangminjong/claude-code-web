# Claude Code Web — 구현 진행 상황

> 최종 업데이트: 2026-03-13

---

## 1. 프로젝트 개요

Claude Code CLI를 감싸는 웹 채팅 UI.
공용 서버에 설치하여 팀원이 브라우저로 접속, 각자 독립된 Claude Code 세션을 사용할 수 있다.

---

## 2. 구현 완료 항목

### 2-1. 서버 (Node.js + Express)

| 파일 | 역할 | 상태 |
|------|------|------|
| `server/src/app.js` | Express + HTTP + WebSocket 진입점, 정적 파일 서빙 | 완료 |
| `server/src/db/schema.sql` | DDL (users, sessions, messages, audit_logs + 인덱스) | 완료 |
| `server/src/db/connection.js` | SQLite 연결, WAL 모드, 스키마 자동 초기화 | 완료 |
| `server/src/utils/jwt.js` | JWT 서명/검증 (signToken, verifyToken) | 완료 |
| `server/src/utils/pathValidator.js` | 경로 탈출 방지 (../, 절대경로, 심볼릭 링크 차단) | 완료 |
| `server/src/middleware/authenticate.js` | JWT Bearer 토큰 인증 미들웨어 | 완료 |
| `server/src/middleware/pathGuard.js` | 파일 API 경로 보안 미들웨어 | 완료 |
| `server/src/services/auditLogger.js` | 감사 로그 INSERT (비동기, 실패해도 메인 로직 미차단) | 완료 |
| `server/src/services/processManager.js` | node-pty 프로세스 생명주기 (spawn, write, resize, kill) | 완료 |
| `server/src/services/sessionManager.js` | 세션 CRUD, 3개 제한, heartbeat/idle timeout 체커 | 완료 |
| `server/src/routes/auth.js` | 회원가입, 로그인, 로그아웃, 내 정보, 비밀번호 변경 | 완료 |
| `server/src/routes/sessions.js` | 세션 목록/생성/상세/종료/대화히스토리 | 완료 |
| `server/src/routes/files.js` | 디렉토리 목록, 파일 업로드(multer), 다운로드 | 완료 |
| `server/src/routes/logs.js` | 감사 로그 조회 (페이지네이션, 액션 필터) | 완료 |
| `server/src/ws/wsServer.js` | WebSocket 서버 설정, JWT 인증 후 핸들러 연결 | 완료 |
| `server/src/ws/wsHandler.js` | WS 메시지 핸들링 (input/heartbeat/resize), PTY 출력 스트리밍 | 완료 |

#### REST API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| PUT | `/api/auth/password` | 비밀번호 변경 |
| GET | `/api/sessions` | 내 세션 목록 |
| POST | `/api/sessions` | 새 세션 생성 |
| GET | `/api/sessions/:id` | 세션 상세 |
| DELETE | `/api/sessions/:id` | 세션 종료 |
| GET | `/api/sessions/:id/messages` | 대화 히스토리 |
| GET | `/api/files` | 디렉토리 목록 |
| POST | `/api/files/upload` | 파일 업로드 |
| GET | `/api/files/download` | 파일 다운로드 |
| GET | `/api/logs` | 감사 로그 조회 |
| GET | `/api/health` | 헬스체크 |

#### WebSocket 프로토콜

```
연결: ws://{host}:{port}/ws?token={JWT}&sessionId={세션ID}

클라이언트 → 서버: { type: "input" | "heartbeat" | "resize", ... }
서버 → 클라이언트: { type: "output" | "status" | "heartbeat_ack" | "error", ... }
```

---

### 2-2. 클라이언트 (React + Vite)

| 파일 | 역할 | 상태 |
|------|------|------|
| `client/src/main.jsx` | React 진입점, BrowserRouter 설정 | 완료 |
| `client/src/App.jsx` | 라우팅 (ProtectedRoute/GuestRoute), Toaster | 완료 |
| `client/src/index.css` | 전역 CSS (다크 테마, CSS 변수, 스크롤바) | 완료 |
| `client/src/api/client.js` | API 클라이언트 (fetch 래퍼, JWT 자동 첨부) | 완료 |
| `client/src/stores/authStore.js` | Zustand: 사용자 인증 상태 관리 | 완료 |
| `client/src/stores/sessionStore.js` | Zustand: 세션 목록/활성세션/메시지 관리 | 완료 |
| `client/src/hooks/useAuth.js` | 인증 커스텀 훅 (init, login, register, logout) | 완료 |
| `client/src/hooks/useWebSocket.js` | WebSocket 커스텀 훅 (heartbeat, sendInput, sendResize) | 완료 |

#### 컴포넌트

| 컴포넌트 | 설명 | 상태 |
|----------|------|------|
| `Auth/LoginForm` | 이메일/비밀번호 로그인 폼 | 완료 |
| `Auth/RegisterForm` | 회원가입 폼 (이름, 이메일, 비밀번호) | 완료 |
| `Layout/AppShell` | 사이드바 + 메인 콘텐츠 레이아웃 | 완료 |
| `Layout/Sidebar` | 세션 목록, 네비게이션, 사용자 정보, 로그아웃 | 완료 |
| `Session/SessionList` | 활성/종료 세션 그룹화 표시 | 완료 |
| `Session/SessionItem` | 세션 항목 (상태 dot, 종료 버튼) | 완료 |
| `Session/NewSessionModal` | 새 세션 생성 모달 (이름, 프로젝트 경로) | 완료 |
| `Chat/ChatWindow` | **xterm.js 터미널** (활성세션) / 메시지 버블 (종료세션) | 완료 |
| `Chat/MessageBubble` | 대화 메시지 (코드 블록 파싱 포함) | 완료 |
| `Chat/CodeBlock` | 코드 블록 렌더링 + 복사 버튼 | 완료 |
| `Chat/StreamIndicator` | 스트리밍 중 애니메이션 (bounce dots) | 완료 |
| `Files/FileExplorer` | 파일 탐색기 (breadcrumb, 목록) | 완료 |
| `Files/FileItem` | 파일/폴더 항목 (크기, 날짜, 다운로드 버튼) | 완료 |
| `Files/UploadButton` | 파일 업로드 버튼 | 완료 |
| `Settings/SettingsPage` | 프로필 정보, 비밀번호 변경, 세션 설정 표시 | 완료 |

---

### 2-3. 버그 수정

| 문제 | 원인 | 수정 |
|------|------|------|
| 세션 대화창에 ANSI 이스케이프 코드가 그대로 출력됨 | Claude Code CLI는 터미널 앱으로 ANSI 시퀀스를 사용하나, 일반 텍스트로 렌더링하고 있었음 | `ChatWindow`를 xterm.js 터미널 에뮬레이터로 교체. 활성 세션은 터미널에서 직접 렌더링, 종료된 세션은 메시지 버블 히스토리로 표시 |
| 파일 업로드 라우트에서 `await import('fs')` 사용 | ESM에서 이미 상단에 import한 fs를 다시 dynamic import | 상단 `import`에 `renameSync` 추가, dynamic import 제거 |
| 파일 업로드 경로 검증 로직 오류 | `resolve().replace(userRoot, '')`로 상대경로 역산 시 정확하지 않음 | `validatePath(userRoot, targetDir + '/' + filename)`으로 수정 |

---

## 3. 프로젝트 구조

```
claude-code-web/
├── client/                         # React + Vite
│   ├── src/
│   │   ├── api/client.js           # API 클라이언트
│   │   ├── components/
│   │   │   ├── Auth/               # 로그인, 회원가입
│   │   │   ├── Chat/               # 터미널(xterm.js), 메시지, 코드블록
│   │   │   ├── Files/              # 파일 탐색기, 업로드, 다운로드
│   │   │   ├── Layout/             # AppShell, Sidebar
│   │   │   ├── Session/            # 세션 목록, 아이템, 생성 모달
│   │   │   └── Settings/           # 설정 페이지
│   │   ├── hooks/                  # useAuth, useWebSocket
│   │   ├── stores/                 # Zustand (authStore, sessionStore)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                         # Node.js + Express
│   ├── src/
│   │   ├── routes/                 # auth, sessions, files, logs
│   │   ├── middleware/             # authenticate, pathGuard
│   │   ├── services/              # sessionManager, processManager, auditLogger
│   │   ├── ws/                    # wsServer, wsHandler
│   │   ├── db/                    # connection, schema.sql
│   │   ├── utils/                 # jwt, pathValidator
│   │   └── app.js
│   ├── .env / .env.example
│   └── package.json
│
├── workspace/                      # 사용자별 작업 디렉토리 (런타임 생성)
├── data/                           # SQLite DB (런타임 생성)
├── .gitignore
└── package.json                    # 루트 워크스페이스
```

---

## 4. 실행 방법

```bash
# 개발 모드 (터미널 2개)
cd server && npm run dev          # 서버 :3000
cd client && npm run dev          # 클라이언트 :5173 (API/WS → :3000 프록시)

# 프로덕션 (단일 포트)
cd client && npm run build        # 정적 빌드 생성
cd server && npm start            # :3000에서 API + 정적 파일 모두 서빙
```

---

## 5. 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | Node.js, Express, ws, node-pty, better-sqlite3, bcrypt, jsonwebtoken, multer |
| Frontend | React 19, Vite 6, Zustand, xterm.js, react-hot-toast, react-router-dom |
| DB | SQLite (WAL 모드) |
| 인증 | JWT (Bearer 토큰) |

---

## 6. 미구현 / 2차 개발 항목

| 항목 | 상태 |
|------|------|
| SSH 모드 (원격 서버 접속) | 2차 개발 예정 |
| 감사 로그 UI (브라우저에서 조회) | API만 구현, 전용 화면 미구현 |
| 사용자 관리 (관리자 페이지) | 미구현 |
| 세션 설정 동적 변경 (idle timeout 등) | 화면 표시만, 변경 기능 미구현 |
| 보안 강화 (rate limiting, CSRF 등) | 미구현 |
| Docker/docker-compose 배포 설정 | 미구현 |

---

## 7. 주요 설계 결정

1. **xterm.js 터미널 사용**: Claude Code CLI는 터미널 앱으로 ANSI 이스케이프 시퀀스를 사용한다. 초기에는 메시지 버블 UI로 구현했으나, 원시 터미널 출력이 깨져 보이는 문제로 xterm.js로 전환했다. 활성 세션은 터미널, 종료된 세션은 저장된 메시지 히스토리를 버블로 표시한다.

2. **전역 설정 미변경**: `~/.claude/` 등 Claude Code의 전역 설정은 일체 건드리지 않았다. 세션별 프로세스는 `workspace/{username}/{project}` 경로를 cwd로 사용한다.

3. **SQLite WAL 모드**: 동시 읽기/쓰기 성능을 위해 WAL 모드를 사용한다. 팀원 3명 규모에서 충분하다.

4. **감사 로그 비동기**: `auditLog()` 함수는 실패해도 메인 로직을 차단하지 않는다 (try-catch 내부 처리).
