# Claude Code Web — 구현 진행 상황

> 최종 업데이트: 2026-03-25

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
| `server/src/middleware/authenticate.js` | JWT Bearer 토큰 + 쿼리 파라미터 토큰 인증 미들웨어 | 완료 |
| `server/src/middleware/pathGuard.js` | 파일 API 경로 보안 미들웨어 | 완료 |
| `server/src/services/auditLogger.js` | 감사 로그 INSERT (비동기, 실패해도 메인 로직 미차단) | 완료 |
| `server/src/services/processManager.js` | node-pty 프로세스 생명주기 (spawn, write, resize, kill) | 완료 |
| `server/src/services/sessionManager.js` | 세션 CRUD, 3개 제한, heartbeat/idle timeout 체커 | 완료 |
| `server/src/routes/auth.js` | 회원가입, 로그인, 로그아웃, 내 정보, 비밀번호 변경, 아바타 업로드/삭제/서빙 | 완료 |
| `server/src/routes/sessions.js` | 세션 목록/생성/상세/종료/대화히스토리 | 완료 |
| `server/src/routes/files.js` | 디렉토리 목록, 파일 업로드/다운로드, 생성/삭제/이름변경 | 완료 |
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
| POST | `/api/auth/avatar` | 프로필 아바타 업로드 |
| DELETE | `/api/auth/avatar` | 프로필 아바타 삭제 |
| GET | `/api/auth/avatar/:filename` | 아바타 이미지 서빙 |
| GET | `/api/sessions` | 내 세션 목록 |
| POST | `/api/sessions` | 새 세션 생성 |
| GET | `/api/sessions/:id` | 세션 상세 |
| DELETE | `/api/sessions/:id` | 세션 종료 |
| GET | `/api/sessions/:id/messages` | 대화 히스토리 |
| GET | `/api/files` | 디렉토리 목록 |
| POST | `/api/files/upload` | 파일 업로드 |
| GET | `/api/files/download` | 파일 다운로드 |
| POST | `/api/files/create` | 빈 파일 생성 |
| POST | `/api/files/mkdir` | 폴더 생성 |
| POST | `/api/files/rename` | 파일/폴더 이름 변경 |
| DELETE | `/api/files` | 파일/폴더 삭제 |
| GET | `/api/logs` | 감사 로그 조회 |
| GET | `/api/health` | 헬스체크 |

#### WebSocket 프로토콜

```
연결: ws://{host}:{port}/ws?token={JWT}&sessionId={세션ID}

클라이언트 → 서버: { type: "input" | "heartbeat" | "resize", ... }
서버 → 클라이언트: { type: "output" | "status" | "heartbeat_ack" | "error", ... }
```

---

### 2-1b. SSH 모드 (2차)

| 파일 | 역할 | 상태 |
|------|------|------|
| `server/src/utils/crypto.js` | AES-256-GCM SSH 자격 증명 암호화/복호화 | 완료 |
| `server/src/services/sshProfileManager.js` | SSH 프로필 CRUD, 경로 검증 (Windows 호환) | 완료 |
| `server/src/routes/sshProfiles.js` | SSH 프로필 API + SFTP 원격 폴더 탐색 + 연결 테스트 | 완료 |
| `server/src/services/processManager.js` | SSHFS 마운트 관리 + 로컬 Claude CLI 실행 | 완료 |
| `client/src/stores/sshProfileStore.js` | SSH 프로필 Zustand 스토어 | 완료 |
| `client/src/components/Settings/SshProfileForm.jsx` | SSH 프로필 생성/수정 + 폴더 찾아보기 | 완료 |
| `client/src/components/Settings/RemoteFolderBrowser.jsx` | 원격 폴더 탐색기 모달 (SFTP + 네이티브) | 완료 |

### 2-2. 클라이언트 (React + Vite)

| 파일 | 역할 | 상태 |
|------|------|------|
| `client/src/main.jsx` | React 진입점, BrowserRouter 설정 | 완료 |
| `client/src/App.jsx` | 라우팅 (ProtectedRoute/GuestRoute), Toaster | 완료 |
| `client/src/index.css` | 전역 CSS (테마 CSS 변수, 스크롤바) | 완료 |
| `client/src/api/client.js` | API 클라이언트 (fetch 래퍼, JWT 자동 첨부) | 완료 |
| `client/src/stores/authStore.js` | Zustand: 사용자 인증 상태 관리 (아바타 포함) | 완료 |
| `client/src/stores/sessionStore.js` | Zustand: 세션 목록/활성세션/메시지 관리 | 완료 |
| `client/src/stores/themeStore.js` | Zustand: 테마 상태 관리 (6종, localStorage 영속화) | 완료 |
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
| `Chat/ClaudeAvatar` | Claude 공식 로고 SVG 아바타 | 완료 |
| `Chat/UserAvatar` | 유저 프로필 이미지 또는 이니셜 아바타 | 완료 |
| `Chat/CodeBlock` | 코드 블록 렌더링 + 복사 버튼 | 완료 |
| `Chat/StreamIndicator` | 스트리밍 중 애니메이션 (bounce dots) | 완료 |
| `Files/FileExplorer` | 레거시 파일 탐색기 (v2.7.1에서 Explorer 패널로 대체) | 완료 |
| `Files/FileItem` | 레거시 파일/폴더 항목 | 완료 |
| `Files/UploadButton` | 파일 업로드 버튼 (Explorer 패널에서도 사용) | 완료 |
| `Explorer/ExplorerPanel` | VS Code 스타일 오른쪽 패널 (리사이즈, 접기, 드래그 앤 드롭) | 완료 |
| `Explorer/ExplorerTree` | 트리 뷰 (컨텍스트 메뉴, 인라인 입력, 이름 변경, 파일 드래그) | 완료 |
| `Settings/SettingsPage` | 프로필(아바타), 테마 선택, 비밀번호 변경, 세션 설정 | 완료 |

---

### 2-2b. 세션 지속성 (2.6차)

| 기능 | 설명 | 상태 |
|------|------|------|
| 세션 자동 이름 | "새 채팅"으로 생성, 첫 메시지 전송 시 메시지 내용(30자)으로 자동 변경 | 완료 |
| 세션 재개 | 종료된 세션에서 "이어서 대화" 클릭 → `--resume {claudeSessionId}`로 컨텍스트 복원 | 완료 |
| claude_session_id 영속화 | DB `sessions.claude_session_id` 컬럼 추가, 서버 재시작 후에도 재개 가능 | 완료 |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `server/src/db/connection.js` | `claude_session_id` 컬럼 마이그레이션 추가 |
| `server/src/services/sessionManager.js` | `updateSessionName()`, `updateClaudeSessionId()`, `resumeSession()` 추가 |
| `server/src/routes/sessions.js` | `PATCH /:id/name`, `POST /:id/resume` 엔드포인트 추가, 이름 필수값 해제 |
| `server/src/ws/wsHandler.js` | 첫 메시지 시 자동 이름 변경, claude_session_id DB 저장, 종료 세션 연결 허용, 재개 시 메모리 복원 |
| `client/src/api/client.js` | `renameSession()`, `resumeSession()` API 추가 |
| `client/src/stores/sessionStore.js` | `resumeSession`, `renameSession` 액션 추가 |
| `client/src/hooks/useWebSocket.js` | `session_renamed` 이벤트 처리 |
| `client/src/components/Session/NewSessionModal.jsx` | 세션 이름 선택사항으로 변경 |
| `client/src/components/Chat/ChatWindow.jsx` | 종료 세션에 "이어서 대화" 버튼 추가, 세션 메타데이터 표시 (크기/Git/시간), 세션 삭제 버튼 |
| `server/src/routes/sessions.js` | `GET /:id/metadata`, `DELETE /:id/permanent` 엔드포인트 추가 |
| `server/src/services/sessionManager.js` | `deleteSessionPermanently()` — DB + Claude CLI 세션 파일 완전 삭제, `getSessionMetadata()` 추가 |
| `server/src/utils/claudeSessionCleaner.js` | Claude CLI 세션 파일 삭제 유틸 (JSONL + history.jsonl) |

### 2-2c. CLI 세션 탐색기 (2.7차)

| 기능 | 설명 | 상태 |
|------|------|------|
| 사이드바 탭 | "내 세션" / "CLI 히스토리" 탭 전환 | 완료 |
| CLI 세션 목록 | `~/.claude/history.jsonl` 파싱, 프로젝트별 그룹핑 | 완료 |
| 검색 & 통계 | 키워드 검색, 세션 수/크기/프로젝트 통계 요약 | 완료 |
| CLI 세션 상세 | 메인 영역에 세션 정보 카드 (크기, 메시지 수, Git, 프로젝트) | 완료 |
| adopt | CLI 세션을 웹 세션으로 연결 (`--resume`으로 컨텍스트 복원) | 완료 |
| CLI 세션 삭제 | JSONL 파일 + history.jsonl 항목 완전 삭제 | 완료 |
| 새로고침 버튼 | 스피닝 애니메이션 + 서버 캐시 강제 갱신 | 완료 |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `server/src/services/cliSessionService.js` | history.jsonl 파싱, 메타데이터 조회, 60초 캐시, adopt, 삭제 |
| `server/src/routes/cliSessions.js` | CLI 세션 API (목록, 통계, adopt, 삭제) |
| `server/src/utils/claudeSessionCleaner.js` | Claude CLI 세션 파일 완전 삭제 유틸 |
| `client/src/stores/cliSessionStore.js` | CLI 세션 Zustand 스토어 |
| `client/src/components/Session/CliSessionList.jsx` | 사이드바 CLI 세션 목록 (검색, 그룹, 통계, 새로고침) |
| `client/src/components/Session/CliSessionItem.jsx` | CLI 세션 아이템 (ID, 시간, 크기, 이름) |
| `client/src/components/Session/CliSessionDetail.jsx` | CLI 세션 상세보기 + adopt 버튼 |
| `client/src/components/Layout/Sidebar.jsx` | 탭 전환 UI 추가 |
| `client/src/components/Layout/AppShell.jsx` | `/cli-session` 라우트 추가 |

### 2-2d. VS Code 파일 익스플로러 (v2.7.1)

| 기능 | 설명 | 상태 |
|------|------|------|
| 오른쪽 패널 | 메인 콘텐츠 오른쪽에 리사이즈 가능한 Explorer 패널 | 완료 |
| 트리 뷰 | 재귀적 폴더 확장/접기, 온디맨드 디렉토리 로딩 | 완료 |
| 파일 아이콘 | 확장자별 아이콘/색상 (JS, JSX, TS, CSS, HTML, PY, MD 등) | 완료 |
| 패널 토글 | 사이드바 '파일 탐색기' 버튼으로 패널 열기/닫기 (기본 열림) | 완료 |
| 패널 접기 | 36px 세로 바로 축소, 클릭하면 펼침 | 완료 |
| 리사이즈 | 드래그 핸들로 패널 너비 조절 (200~600px) | 완료 |
| 새로고침/접기 | 전체 트리 새로고침, 모든 폴더 접기 버튼 | 완료 |
| 컨텍스트 메뉴 | 우클릭으로 새 파일/폴더 생성, 이름 변경, 다운로드, 삭제 | 완료 |
| 인라인 입력 | 트리 내에서 직접 파일/폴더 이름 입력 (Enter 또는 포커스 아웃으로 확정) | 완료 |
| 드래그 앤 드롭 | 외부에서 파일 드래그 업로드 (드롭존 오버레이), 파일 드래그 다운로드 | 완료 |
| 파일 업로드 | 선택된 폴더 경로에 파일 업로드 (버튼 + 드래그) | 완료 |
| 한글 파일명 | 업로드 multer latin1→UTF-8 복원, 다운로드 RFC 5987 인코딩 | 완료 |

#### REST API (v2.7.1 추가)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/files/create` | 빈 파일 생성 |
| POST | `/api/files/mkdir` | 폴더 생성 |
| POST | `/api/files/rename` | 파일/폴더 이름 변경 |
| DELETE | `/api/files` | 파일/폴더 삭제 (재귀) |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `client/src/stores/explorerStore.js` | Explorer Zustand 스토어 (트리 상태, 확장/접기, 컨텍스트 메뉴, 생성/이름변경) |
| `client/src/components/Explorer/ExplorerPanel.jsx` | 오른쪽 패널 (헤더, 리사이즈, 접기/펼치기, 드래그 앤 드롭 업로드) |
| `client/src/components/Explorer/ExplorerTree.jsx` | 트리 뷰 (컨텍스트 메뉴, 인라인 입력, 이름 변경, 파일 드래그 다운로드) |
| `client/src/components/Explorer/Explorer.css` | VS Code 스타일 CSS (접힌 상태, 컨텍스트 메뉴, 드롭 오버레이) |
| `client/src/components/Layout/AppShell.jsx` | ExplorerPanel 추가, /files 라우트 제거 |
| `client/src/components/Layout/Sidebar.jsx` | '파일 탐색기' 버튼을 Explorer 토글로 변경 |
| `client/src/api/client.js` | createFile, createDir, renameFile, deleteFile API 추가, downloadFile 에러 처리 |
| `server/src/routes/files.js` | mkdir, create, rename, delete 엔드포인트, 한글 파일명 수정 |
| `server/src/middleware/authenticate.js` | 쿼리 파라미터 token 인증 지원 |

### 2-2e. 파일 에디터 (v2.7.2)

| 기능 | 설명 | 상태 |
|------|------|------|
| Monaco Editor | VS Code 에디터 엔진으로 코드 편집 | 완료 |
| 탭 시스템 | 여러 파일을 탭으로 열고 전환 | 완료 |
| 파일 읽기/쓰기 API | `GET /api/files/read`, `PUT /api/files/write` | 완료 |
| Ctrl+S 저장 | 에디터 내 키보드 단축키로 저장 | 완료 |
| 언어 감지 | 확장자 기반 구문 강조 (50+ 확장자) | 완료 |
| 테마 연동 | 앱 테마 (다크/라이트)에 따라 에디터 테마 자동 전환 | 완료 |
| 더티 상태 표시 | 수정된 파일 탭에 파란색 dot 표시 | 완료 |
| 미저장 경고 | 수정된 파일 탭 닫기 시 확인 다이얼로그 | 완료 |
| 채팅 전환 | 탭 바 채팅 아이콘 또는 세션 클릭으로 채팅 화면 복귀 | 완료 |
| 파일 삭제/이름변경 연동 | Explorer에서 삭제/이름변경 시 열린 탭 자동 정리 | 완료 |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `server/src/routes/files.js` | `GET /read` (파일 내용 읽기, 10MB 제한), `PUT /write` (파일 저장, 감사 로그) |
| `server/src/app.js` | `express.json()` body 제한 10MB로 증가 |
| `client/src/api/client.js` | `readFileContent()`, `writeFileContent()` API 추가 |
| `client/src/stores/editorStore.js` | 에디터 Zustand 스토어 (탭, 활성탭, dirty, 열기/닫기/저장) |
| `client/src/components/Editor/EditorPanel.jsx` | Monaco Editor 기반 에디터 컴포넌트 (탭 바, 저장, 채팅 전환) |
| `client/src/components/Editor/Editor.css` | 에디터 스타일 (탭 바, 로딩/에러 상태) |
| `client/src/components/Layout/AppShell.jsx` | 에디터/채팅 뷰 전환 로직 |
| `client/src/components/Explorer/ExplorerTree.jsx` | 파일 클릭 시 에디터 열기, 삭제/이름변경 시 탭 정리 |
| `client/src/components/Session/SessionList.jsx` | 세션 선택 시 에디터 비활성화 |

### 2-2f. WebSocket 재연결 + 메시지 신뢰성 (v2.7.3)

| 기능 | 설명 | 상태 |
|------|------|------|
| Exponential backoff 재연결 | 1s→2s→4s→8s→16s→30s(max), 최대 20회, jitter 포함 | 완료 |
| 연결 상태 UI | 4단계 표시 (connecting/connected/reconnecting/disconnected) + 배너 | 완료 |
| 안정성 타이머 | 5초간 안정 유지 후에만 retryCount 리셋 (connect-disconnect 루프 방지) | 완료 |
| 메시지 큐 | 연결 안 됐을 때 보낸 메시지를 버퍼링, 연결 후 자동 전송 | 완료 |
| **messageId 매칭** | 모든 요청에 고유 messageId 부여, 서버가 모든 응답에 동일 messageId 태깅 | 완료 |
| stale response 거부 | 클라이언트가 activeMessageId와 다른 응답을 무시 (응답 뒤섞임 방지) | 완료 |
| 응답 도중 끊김 복구 | 서버가 프로세스 출력을 계속 버퍼링, 재연결 시 누적 응답 전달 | 완료 |
| unsentEnd 보관 | 프로세스가 WS 끊긴 사이에 완료되면 60초간 응답 보관, 재연결 시 전달 | 완료 |
| 수동 재연결 | 최대 시도 초과 후 "다시 연결" 버튼 | 완료 |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `client/src/hooks/useWebSocket.js` | 전면 재작성 — backoff, stability timer, messageId 추적, 메시지 큐, reconnect 함수 |
| `server/src/ws/wsHandler.js` | activeConnections 맵, messageId 태깅, safeSend, WS 교체, 응답 버퍼링/복구, unsentEnd |
| `client/src/components/Chat/ChatWindow.jsx` | connState/retryCount UI, 재연결 배너, 재연결 중 입력 상태 |
| `client/src/components/Chat/Chat.css` | reconnecting/disconnected 상태 스타일, pulse 애니메이션, 배너, 스피너 |

#### WebSocket 프로토콜 (v2.7.3 변경)

```
클라이언트 → 서버:
  { type: "message", content: "...", messageId: "msg_1711..." }
  { type: "cancel", messageId: "msg_1711..." }
  { type: "heartbeat" }

서버 → 클라이언트:
  { type: "connected", sessionId: 63 }
  { type: "assistant_start", messageId: "msg_1711..." }
  { type: "assistant_chunk", content: "...", messageId: "msg_1711..." }
  { type: "assistant_end", content: "...", exitCode: 0, messageId: "msg_1711..." }
  { type: "error", message: "...", messageId: "msg_1711..." }
  { type: "assistant_cancelled", messageId: "msg_1711..." }
  { type: "session_renamed", name: "..." }
  { type: "heartbeat_ack" }
```

### 2-2g. Claude 캐릭터 아바타 (v2.7.4)

| 기능 | 설명 | 상태 |
|------|------|------|
| 캐릭터 이미지 | SVG 로고 → 픽셀 캐릭터 이미지로 교체 | 완료 |
| 상태별 전환 | 기본: `chat.png`, 응답 중: `chatbarq.gif` 애니메이션 | 완료 |
| 이미지 서빙 | `data/image/`를 `/assets/image/`로 정적 서빙 | 완료 |

#### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `client/src/components/Chat/ClaudeAvatar.jsx` | SVG → 이미지 기반, `isAnimated` prop으로 png/gif 전환 |
| `client/src/components/Chat/ChatWindow.jsx` | thinking indicator에 `isAnimated` 적용 |
| `client/src/components/Chat/MessageBubble.jsx` | 스트리밍 중 `isAnimated` 전달 |
| `server/src/app.js` | `/assets/image` 정적 서빙 추가 |
| `client/vite.config.js` | `/assets` 프록시 추가 |

### 2-3. 버그 수정

| 문제 | 원인 | 수정 |
|------|------|------|
| 세션 대화창에 ANSI 이스케이프 코드가 그대로 출력됨 | Claude Code CLI는 터미널 앱으로 ANSI 시퀀스를 사용하나, 일반 텍스트로 렌더링하고 있었음 | `ChatWindow`를 xterm.js 터미널 에뮬레이터로 교체. 활성 세션은 터미널에서 직접 렌더링, 종료된 세션은 메시지 버블 히스토리로 표시 |
| 파일 업로드 라우트에서 `await import('fs')` 사용 | ESM에서 이미 상단에 import한 fs를 다시 dynamic import | 상단 `import`에 `renameSync` 추가, dynamic import 제거 |
| 파일 업로드 경로 검증 로직 오류 | `resolve().replace(userRoot, '')`로 상대경로 역산 시 정확하지 않음 | `validatePath(userRoot, targetDir + '/' + filename)`으로 수정 |
| 아바타 업로드 시 EXDEV 에러 | `/tmp`(multer) → `/home`(avatars)가 서로 다른 파일시스템이라 `renameSync` 실패 | `copyFileSync` + `unlinkSync`로 변경 |

---

## 3. 프로젝트 구조

```
claude-code-web/
├── client/                         # React + Vite
│   ├── src/
│   │   ├── api/client.js           # API 클라이언트
│   │   ├── components/
│   │   │   ├── Auth/               # 로그인, 회원가입
│   │   │   ├── Chat/               # 터미널(xterm.js), 메시지, 코드블록, 아바타
│   │   │   ├── Explorer/            # VS Code 스타일 파일 익스플로러 (트리 뷰)
│   │   │   ├── Files/              # 레거시 파일 탐색기, 업로드 버튼
│   │   │   ├── Layout/             # AppShell, Sidebar
│   │   │   ├── Session/            # 세션 목록, CLI 탐색기, 생성 모달
│   │   │   └── Settings/           # 설정 페이지
│   │   ├── hooks/                  # useAuth, useWebSocket
│   │   ├── stores/                 # Zustand (authStore, sessionStore, themeStore, cliSessionStore, explorerStore)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                         # Node.js + Express
│   ├── src/
│   │   ├── routes/                 # auth, sessions, files, logs, cliSessions
│   │   ├── middleware/             # authenticate, pathGuard
│   │   ├── services/              # sessionManager, processManager, auditLogger, cliSessionService
│   │   ├── ws/                    # wsServer, wsHandler
│   │   ├── db/                    # connection, schema.sql
│   │   ├── utils/                 # jwt, pathValidator, claudeSessionCleaner
│   │   └── app.js
│   ├── .env / .env.example
│   └── package.json
│
├── avatars/                        # 유저 프로필 아바타 (런타임 생성)
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
| Backend | Node.js, Express, ws, ssh2, better-sqlite3, bcrypt, jsonwebtoken, multer |
| System | fuse-sshfs, sshpass (SSH 모드 필수) |
| Frontend | React 19, Vite 6, Zustand, xterm.js, react-hot-toast, react-router-dom |
| DB | SQLite (WAL 모드) |
| 인증 | JWT (Bearer 토큰) |

---

## 6. 개발 로드맵

| 버전 | 항목 | 상태 |
|------|------|------|
| **v1.0** | 인증, 채팅 UI, 세션 관리, 대화 히스토리, 파일, 감사 로그, 버그 수정 | **완료** |
| **v2.0** | SSH 프로필, SSHFS 마운트, 원격 폴더 탐색기, 경로 검증, HTTPS | **완료** |
| **v2.5** | 프로필 아바타, Claude 로고 아이콘, 멀티 테마 (6종) | **완료** |
| **v2.6** | 세션 자동 이름 (첫 메시지 기반), 세션 재개 (`--resume`), claude_session_id DB 영속화, 세션 메타데이터 (크기/Git/시간), 세션 완전 삭제 (Claude CLI 포함) | **완료** |
| **v2.7** | 사이드바 탭 (내 세션/CLI 히스토리), 프로젝트별 그룹핑, 키워드 검색, 통계, CLI→웹 세션 연결 (adopt), CLI 세션 삭제, 새로고침 버튼 | **완료** |
| **v2.7.1** | VS Code 스타일 파일 익스플로러 (오른쪽 패널, 트리 뷰, 리사이즈, 파일 아이콘) | **완료** |
| **v2.7.2** | 파일 에디터 (Monaco Editor, 탭 시스템, 파일 읽기/쓰기, Ctrl+S 저장) | **완료** |
| **v2.7.3** | WebSocket 재연결 + messageId 기반 요청-응답 매칭 (exponential backoff, 메시지 큐, 응답 복구, stale response 방지) | **완료** |
| **v2.7.4** | Claude 캐릭터 아바타 — 기본 chat.png, 응답 중 chatbarq.gif 애니메이션 전환 | **완료** |
| **v2.7.5** | Workspace 경로 분리 — Git 저장소 밖으로 이동, adopt 버그 수정, DB 마이그레이션 | **완료** |
| **v3.0** | 마크다운, 코드 구문 강조, HTML/SVG 프리뷰, 머메이드, 차트, 도구 사용 알림 | 미구현 |
| **v4.0** | 보안 강화, Docker, 감사 로그 UI, 사용자 관리, 세션 설정 | 미구현 |

---

## 7. 주요 설계 결정

1. **print 모드 + stream-json**: Claude Code CLI를 `-p --output-format stream-json --verbose --include-partial-messages` 플래그로 실행하여 토큰 단위 실시간 스트리밍을 구현한다. 초기에는 node-pty 대화형 모드를 사용했으나, ANSI 이스케이프 코드 파싱 문제로 print 모드로 전환했다.

2. **전역 설정 미변경**: `~/.claude/` 등 Claude Code의 전역 설정은 일체 건드리지 않았다. 세션별 프로세스는 `workspace/{username}/{project}` 경로를 cwd로 사용한다.

3. **SQLite WAL 모드**: 동시 읽기/쓰기 성능을 위해 WAL 모드를 사용한다. 팀원 3명 규모에서 충분하다.

4. **감사 로그 비동기**: `auditLog()` 함수는 실패해도 메인 로직을 차단하지 않는다 (try-catch 내부 처리).
