# Claude Code Web — 변경 이력

---

## 2026-03-26

### 13. [v2.7.6] 통합 세션 리스트

"내 세션"과 "CLI 히스토리" 2개 탭을 하나의 프로젝트별 그룹 리스트로 통합. 세션 상태(active/idle/ended) 개념을 제거하고, 모든 세션이 stateless로 동작.

**핵심 변경:**
- 사이드바 탭(내 세션/CLI 히스토리) 제거 → 단일 세션 리스트
- 세션을 프로젝트 경로(폴더)별로 그룹핑, 접기/펼치기 지원
- CLI 세션 자동 동기화: `~/.claude/projects/` JSONL 파일을 스캔하여 DB에 자동 import
- 세션 상태 제거: resume/adopt 흐름 불필요 — 클릭 → 메시지 전송 → `--resume` 자동 적용
- 세션 없이 메시지 전송 시 자동으로 세션 생성 (빈 채팅 화면에서 바로 대화 시작)
- heartbeat 기반 idle timeout 제거 (프로세스는 매 메시지마다 spawn/종료, 이미 stateless)

**제거된 것:**
- `CliSessionList.jsx`, `CliSessionItem.jsx`, `CliSessionDetail.jsx` — CLI 세션 UI 전체
- `cliSessionStore.js` — CLI 세션 Zustand 스토어
- `cliSessions.js` 라우트 — CLI 세션 API 전체 (`/api/cli-sessions/*`)
- `resumeSession()` — 서버/클라이언트 양쪽
- `startHeartbeatChecker()` — idle timeout 관리
- `destroySession()` → `stopSession()`으로 단순화 (프로세스 정리만, 상태 변경 없음)
- ChatWindow의 "세션이 종료되었습니다" + "이어서 대화" UI
- 사이드바 탭 전환 로직, AppShell의 CLI 세션 라우트

**추가된 것:**
- `POST /api/sessions/sync-cli` — CLI 세션 DB 동기화 엔드포인트
- `syncCliSessions(userId)` — `~/.claude/projects/` 스캔 + DB insert
- ChatWindow에서 세션 없이 첫 메시지 전송 시 자동 세션 생성
- `activateSession(id)` — messages 유지하면서 activeSessionId만 변경 (자동 생성 시 메시지 소멸 방지)
- 새 작업 모달: 워크스페이스 폴더 목록을 버튼 그리드로 표시, 클릭 선택 + 새 폴더 입력

**용어 변경:**
- "새 대화" / "새 채팅" → "새 작업" (코드 작업 도구의 목적에 맞게)

**변경 파일:**
- `server/src/services/sessionManager.js` — resumeSession/heartbeat 제거, syncCliSessions 추가
- `server/src/routes/sessions.js` — resume 라우트 제거, sync-cli 추가, 기본 이름 "새 작업"
- `server/src/app.js` — heartbeat/CLI 라우트 제거
- `server/src/ws/wsHandler.js` — 자동 이름 감지 기준 "새 작업"
- `client/src/stores/sessionStore.js` — resumeSession 제거, syncCliSessions/activateSession 추가
- `client/src/api/client.js` — CLI API 제거, syncCliSessions 추가
- `client/src/components/Session/SessionList.jsx` — 프로젝트별 그룹 리스트로 재작성
- `client/src/components/Session/SessionItem.jsx` — 상태 dot 제거, 시간 표시 추가
- `client/src/components/Session/NewSessionModal.jsx` — 워크스페이스 폴더 선택 그리드, 간소화
- `client/src/components/Layout/Sidebar.jsx` — 탭 제거, "+ 새 작업" 버튼
- `client/src/components/Layout/AppShell.jsx` — CLI 라우트/탭 상태 제거
- `client/src/components/Chat/ChatWindow.jsx` — resume UI 제거, 자동 세션 생성
- `client/src/components/Session/Session.css` — 상태/CLI 스타일 정리, 폴더 그리드 추가
- `client/src/components/Layout/Layout.css` — 탭 스타일 제거

---

### 12. [v2.7.5] Workspace 경로 분리

기존 `workspace/`가 `claude-code-web/` Git 저장소 내부에 위치하여, 사용자 워크스페이스에서 Claude Code 실행 시 상위 앱의 `.git`을 인식하는 문제 해결. 사용자 데이터를 Git 저장소 밖으로 분리.

**경로 변경:**
- `claude-code-web/workspace/` → `/home/forelink/claude/workspaces/` (Git 저장소 밖)
- `claude-code-web/avatars/` → `/home/forelink/claude/avatars/` (WORKSPACE_ROOT 상대 계산 유지)

**서버 설정:**
- `.env`: `WORKSPACE_ROOT`를 상대경로(`../workspace`)에서 절대경로(`/home/forelink/claude/workspaces`)로 변경
- `auth.js`: `AVATAR_DIR`에 `AVATAR_DIR` 환경변수 우선 참조 추가

**adopt 버그 수정:**
- `cliSessionService.js`: `adoptCliSession()`에서 CLI 세션의 절대경로를 `createSession`의 `projectPath`로 전달하면 `WORKSPACE_ROOT + username + absolutePath`로 이중 결합되는 버그
- `sessionManager.js`: `absoluteWorkDir` 옵션 추가 — adopt 시 경로 resolve를 우회하고 절대경로를 직접 사용

**DB 마이그레이션:**
- `sessions.project_path`에서 이전 경로(`/home/forelink/claude/claude-code-web/workspace/`)를 새 경로(`/home/forelink/claude/workspaces/`)로 치환 (12건)

**CLI 히스토리 유저 필터링:**
- 기존: `~/.claude/projects/` 전체를 스캔하여 모든 CLI 세션 표시
- 변경: 로그인 유저의 workspace 경로(`WORKSPACE_ROOT/{username}/`)에 해당하는 세션만 표시
- `getCliSessions()`, `getCliSessionStats()`에 `username` 파라미터 추가
- `cliSessions.js` 라우트에서 `req.user.email`로 username 추출하여 전달

**기타:**
- `NewSessionModal.jsx`: 힌트 텍스트 `workspace/` → `workspaces/` 업데이트
- `.gitignore`: `workspace/` 항목 제거 (더 이상 Git 저장소 내에 없음)

**변경 파일:**
- `server/.env` — WORKSPACE_ROOT 절대경로 변경
- `server/.env.example` — 동일
- `server/src/routes/auth.js` — AVATAR_DIR 환경변수 우선 참조
- `server/src/services/sessionManager.js` — absoluteWorkDir 옵션 추가
- `server/src/services/cliSessionService.js` — adopt 시 absoluteWorkDir 사용, 유저 필터링 추가
- `server/src/routes/cliSessions.js` — username을 서비스에 전달
- `client/src/components/Session/NewSessionModal.jsx` — 힌트 텍스트 수정
- `.gitignore` — workspace/ 항목 제거

---

### 11. [v2.7.4] Claude 캐릭터 아바타

채팅 아바타를 기존 Claude SVG 로고에서 픽셀 캐릭터 이미지로 교체. 상태에 따라 정적/애니메이션 전환.

**이미지 에셋:**
- `data/image/chat.png` — 기본 정적 아바타 (픽셀 캐릭터)
- `data/image/chatbarq.gif` — 응답 중 애니메이션 (쳇바퀴 돌리는 캐릭터)

**구현:**
- `ClaudeAvatar` 컴포넌트: SVG 제거, `isAnimated` prop에 따라 `chat.png` / `chatbarq.gif` 전환
- `MessageBubble`: 스트리밍 중(`isStreaming`)이면 `isAnimated=true`
- `ChatWindow`: thinking indicator에서 `isAnimated` 적용
- `server/src/app.js`: `data/image/`를 `/assets/image/`로 정적 서빙 (7일 캐시)
- `vite.config.js`: `/assets` 프록시 추가 (dev 모드)

**변경 파일:**
- `client/src/components/Chat/ClaudeAvatar.jsx` — SVG → 이미지 기반으로 전면 교체
- `client/src/components/Chat/ChatWindow.jsx` — thinking indicator에 `isAnimated` 추가
- `client/src/components/Chat/MessageBubble.jsx` — 스트리밍 시 `isAnimated` 전달
- `server/src/app.js` — `/assets/image` 정적 서빙 추가
- `client/vite.config.js` — `/assets` 프록시 추가

---

## 2026-03-25

### 10. [v2.7.3] WebSocket 재연결 강화 + messageId 기반 요청-응답 매칭

네트워크 불안정 시 응답이 뒤섞이는 심각한 버그를 해결. 기존에는 messageId 없이 응답을 "현재 질문의 답"으로 가정하여, WS 끊김 후 이전 응답이 새 질문 밑에 표시되는 문제가 있었음.

**근본 원인:**
- 기존: 서버가 `assistant_chunk`를 보내면 클라이언트가 단순히 현재 질문의 답으로 표시
- WS 끊김 → 재연결 시 이전 응답이 새 질문에 매칭되는 race condition
- 예: "1+1?" → "2" 정상 → "3+3" → "2" (이전 답 밀림) → "야" → "6입니다" (뒤늦게 정답)

**messageId 기반 요청-응답 매칭:**
- 클라이언트가 매 메시지에 고유 `messageId` 생성 (`msg_{timestamp}_{counter}`)
- 서버가 모든 응답 이벤트(assistant_start/chunk/end/error)에 동일 messageId 태깅
- 클라이언트가 `activeMessageIdRef`와 불일치하는 stale 응답을 무시 (console 로그)
- 서버 `activeConnections` 맵에 `activeMessageId` 보관, 재연결 시 올바른 messageId로 복구

**Exponential backoff 재연결:**
- 초기 1초 → 2배씩 증가 → 최대 30초, 최대 20회 시도
- 10% jitter로 thundering herd 방지
- 의도적 종료(세션 전환)와 비정상 종료 구분

**안정성 타이머:**
- 연결 성공 후 retryCount를 즉시 0으로 리셋하지 않고, 5초간 안정 유지 후에만 리셋
- connect → 즉시 끊김 → 1초 재연결 → 반복하는 1초 루프 버그 방지

**메시지 큐:**
- WS 연결 안 됐을 때 보낸 메시지를 `messageQueueRef`에 버퍼링
- 연결 성공(`connected` 이벤트) 시 자동으로 flush (첫 메시지 씹힘 해결)

**서버 응답 복구:**
- `activeConnections` 맵: 세션별 현재 WS + 진행 중 프로세스 + 누적 응답 추적
- 프로세스 실행 중 WS 끊김 → 출력을 계속 `fullResponse`에 버퍼링
- 재연결 시 `assistant_start` + 누적 `assistant_chunk`를 새 WS로 전송
- 프로세스가 WS 끊긴 사이에 완료 → `unsentEnd`에 응답 보관 (60초 만료)
- 재연결 시 `unsentEnd` 전달 후 정리

**서버 버그 수정:**
- `existing.ws`가 null일 때 `removeAllListeners()` 호출 시 TypeError 크래시 → null 가드 추가

**연결 상태 UI:**
- 헤더 상태 배지: 연결됨(초록) / 연결 중(노랑) / 재연결 중(노랑 pulse) / 연결 끊김(빨강)
- 재연결 중 배너: 스피너 + "재연결 시도 중... (N회)"
- 재연결 실패 배너: "연결에 실패했습니다." + "다시 연결" 버튼
- 재연결 중에도 메시지 입력 가능 (큐에 저장됨), placeholder 안내 문구 변경

**변경 파일:**
- `client/src/hooks/useWebSocket.js` — 전면 재작성
- `server/src/ws/wsHandler.js` — activeConnections, messageId, safeSend, 응답 복구
- `client/src/components/Chat/ChatWindow.jsx` — connState/retryCount UI, 배너
- `client/src/components/Chat/Chat.css` — 상태 스타일, pulse 애니메이션, 스피너

---

## 2026-03-24

### 9. [v2.7.2] 파일 에디터 (Monaco Editor)

Explorer에서 텍스트/코드 파일 클릭 시 중앙 채팅 영역이 VS Code 스타일 에디터로 전환.

**Monaco Editor 통합:**
- `@monaco-editor/react` (CDN 런타임 로딩)
- 확장자 기반 자동 언어 감지 (JavaScript, TypeScript, Python, Go, Rust, SQL 등 50+ 확장자)
- 앱 테마에 따라 에디터 테마 자동 전환 (다크/라이트)
- minimap, bracket pair colorization, smooth scrolling 등 VS Code 기본 설정

**탭 시스템:**
- 여러 파일을 동시에 열어 탭으로 전환
- 수정된 파일 탭에 파란색 dot 표시 (dirty indicator)
- 탭 닫기 시 미저장 변경사항 있으면 확인 다이얼로그
- 마지막 탭 닫기 시 자동으로 채팅 화면 복귀

**저장:**
- Ctrl+S / Cmd+S 키보드 단축키
- 탭 바 저장 버튼
- 서버에 `PUT /api/files/write`로 저장, 감사 로그 기록

**화면 전환:**
- Explorer에서 텍스트 파일 클릭 → 에디터 표시
- 탭 바 채팅 아이콘 클릭 → 채팅 화면 복귀
- 사이드바 세션 클릭 → 채팅 화면 복귀
- 에디터 탭이 있으면 에디터 유지, 없으면 자동으로 채팅

**서버 API 추가:**
- `GET /api/files/read?path=...` — 파일 내용 읽기 (UTF-8, 10MB 제한)
- `PUT /api/files/write` — 파일 내용 저장 (감사 로그 기록)
- `express.json()` body 제한 10MB로 증가

**연동:**
- Explorer에서 파일 삭제/이름변경 시 열린 에디터 탭 자동 정리

**새 파일:**
- `client/src/stores/editorStore.js` — 에디터 상태 관리
- `client/src/components/Editor/EditorPanel.jsx` — 에디터 컴포넌트
- `client/src/components/Editor/Editor.css` — 에디터 스타일

**변경 파일:**
- `server/src/routes/files.js` — read/write 엔드포인트 추가
- `server/src/app.js` — body 크기 제한 증가
- `client/src/api/client.js` — readFileContent, writeFileContent API
- `client/src/components/Layout/AppShell.jsx` — 에디터/채팅 뷰 전환
- `client/src/components/Explorer/ExplorerTree.jsx` — 파일 클릭 시 에디터 열기
- `client/src/components/Session/SessionList.jsx` — 세션 선택 시 에디터 비활성화

---

## 2026-03-23

### 8. [v2.7.1] VS Code 스타일 파일 익스플로러

기존 `/files` 라우트 기반 파일 탐색기를 VS Code 스타일 오른쪽 패널 트리 뷰로 전환.

**Explorer 패널:**
- 오른쪽 패널: 메인 콘텐츠 오른쪽에 고정, 기본 열림 상태
- 트리 뷰: 폴더 클릭 시 온디맨드 디렉토리 로딩, 재귀적 확장/접기
- 파일 아이콘: 확장자별 아이콘과 색상 (JS, JSX, TS, CSS, HTML, PY, SQL, MD 등)
- 리사이즈: 왼쪽 드래그 핸들로 패널 너비 조절 (200~600px)
- 패널 접기: 36px 세로 바로 축소, 클릭하면 펼침
- VS Code 스타일 UI: EXPLORER 헤더, WORKSPACE 섹션 헤더, 22px 트리 노드

**컨텍스트 메뉴 (우클릭):**
- 새 파일 / 새 폴더: 인라인 입력으로 트리 내에서 직접 생성
- 이름 변경: 인라인 입력, 확장자 전까지만 자동 선택
- 다운로드 (파일만) / 삭제 (confirm 확인)
- 빈 여백 우클릭 시 workspace 루트에 생성

**드래그 앤 드롭:**
- 외부 → 익스플로러: 파일 드래그 업로드, 파란색 점선 드롭존 오버레이
- 익스플로러 → 외부: 파일 드래그 다운로드 (Chrome DownloadURL + uri-list fallback)

**서버 API 추가:**
- `POST /api/files/create` — 빈 파일 생성
- `POST /api/files/mkdir` — 폴더 생성
- `POST /api/files/rename` — 이름 변경
- `DELETE /api/files` — 파일/폴더 삭제 (재귀)

**버그 수정:**
- 파일 업로드 500 에러: `renameSync`의 EXDEV (cross-device) 에러 → `copyFileSync` + `unlinkSync`
- 한글 파일명 깨짐 (업로드): multer `originalname`이 latin1로 디코딩 → `Buffer.from(name, 'latin1').toString('utf8')`
- 한글 파일명 깨짐 (다운로드): `Content-Disposition`에 RFC 5987 `filename*=UTF-8''인코딩` 적용
- 인증 미들웨어: 쿼리 파라미터 `token` 지원 추가 (드래그 다운로드용)

**새 파일:**
- `client/src/stores/explorerStore.js` — Explorer 상태 관리
- `client/src/components/Explorer/ExplorerPanel.jsx` — 패널 컴포넌트
- `client/src/components/Explorer/ExplorerTree.jsx` — 트리 뷰 컴포넌트
- `client/src/components/Explorer/Explorer.css` — VS Code 스타일 CSS

**변경 파일:**
- `client/src/components/Layout/AppShell.jsx` — ExplorerPanel 추가, /files 라우트 제거
- `client/src/components/Layout/Sidebar.jsx` — 파일 탐색기 토글로 변경
- `client/src/api/client.js` — createFile, createDir, renameFile, deleteFile, downloadFile 에러 처리
- `server/src/routes/files.js` — mkdir, create, rename, delete 엔드포인트, 한글 파일명 수정
- `server/src/middleware/authenticate.js` — 쿼리 파라미터 token 인증

---

## 2026-03-17

### 5. [기능] 프로필 아바타 및 Claude 아이콘 개선

채팅 UI에서 유저와 Claude를 명확히 구분할 수 있도록 아바타 시스템 개선.

**유저 프로필 아바타:**
- DB: `users` 테이블에 `avatar_url` 컬럼 추가 (마이그레이션)
- 백엔드: 아바타 업로드(`POST /api/auth/avatar`), 삭제(`DELETE /api/auth/avatar`), 서빙(`GET /api/auth/avatar/:filename`) 엔드포인트 추가
- 아바타 파일은 `avatars/` 디렉토리에 `{userId}_{timestamp}.{ext}` 형식으로 저장
- 이미지 제한: 2MB, JPEG/PNG/GIF/WebP만 허용
- 프론트엔드: `UserAvatar.jsx` 컴포넌트 — 프로필 이미지가 있으면 표시, 없으면 이름 첫 글자
- 설정 페이지에 아바타 미리보기(64px) + 이미지 변경/삭제 버튼 추가
- 사이드바 하단에 유저 아바타(28px) 표시
- `authStore`에 `setAvatarUrl` 액션 추가, 로그인/회원가입/me 응답에 `avatarUrl` 포함

**Claude 아이콘:**
- `ClaudeAvatar.jsx` 컴포넌트 — 공식 Claude 로고 SVG를 주황색(`#da7756`) 배경 위에 흰색으로 렌더링
- `MessageBubble.jsx`, `ChatWindow.jsx` thinking indicator에 적용

**버그 수정:**
- 아바타 업로드 시 `renameSync`가 cross-device link 에러 발생 (`/tmp` → `/home` 간 파일시스템 차이)
- `copyFileSync` + `unlinkSync`로 변경하여 해결

---

### 6. [기능] 멀티 테마 지원

설정에서 테마를 선택할 수 있는 기능 추가.

**테마 목록 (6종):**
- 다크 (Dark) — 기존 GitHub Dark, 기본값
- 다크 소프트 (Dimmed) — GitHub Dimmed, 부드러운 다크
- 라이트 (Light) — 밝은 흰색 배경
- 솔라라이즈드 (Solarized) — 크림색 배경 Solarized Light
- 노드 (Nord) — 파란톤 다크 테마
- 모노카이 (Monokai) — Monokai 에디터 스타일

**구현:**
- `client/src/stores/themeStore.js` — Zustand 스토어, localStorage 영속화, `:root` CSS 변수 동적 교체
- `main.jsx`에서 테마 스토어 import하여 페이지 로드 시 즉시 적용
- 설정 페이지에 테마 카드 그리드 UI (미니 프리뷰 + 선택 하이라이트)

---

## 2026-03-16

### 4. [2차] SSH 모드 — SSHFS 아키텍처 전환 및 안정화

SSH 모드의 아키텍처를 근본적으로 변경하고, 원격 폴더 탐색기 및 HTTPS 설정 추가.

**아키텍처 변경 (processManager.js 전면 재작성):**
- 이전: SSH로 원격 머신에서 `claude` 실행 (원격 머신에 Claude CLI 필요)
- 변경: **SSHFS로 원격 파일시스템 마운트 → 로컬 `claude`가 마운트된 경로에서 실행**
- `sshfs -f` (포그라운드 모드) + `spawn`으로 sshfs 프로세스를 Node.js 자식 프로세스로 관리
- 세션별 마운트 포인트: `/tmp/claude-sshfs/{sessionId}/`
- 세션 종료 시 sshfs 프로세스 종료 → 자동 unmount
- 서버 시작/종료 시 잔존 마운트 자동 정리 (`cleanupAllMounts`)
- `sshpass -f` (파일 기반 비밀번호) 방식으로 특수문자 이슈 해결

**원격 폴더 탐색기 (신규):**
- 백엔드: `POST /api/ssh-profiles/:id/browse` — SFTP 프로토콜로 원격 디렉토리 조회 (OS 무관)
- 프론트엔드: `RemoteFolderBrowser.jsx` — 모달형 원격 폴더 탐색기
  - breadcrumb 네비게이션, 폴더 클릭 탐색, 상위 이동
  - Windows: 드라이브 목록 표시 (C:, D: 등), `showDirectoryPicker()` 네이티브 선택 지원
  - Linux: `/` 루트부터 탐색
- `SshProfileForm.jsx` — 허용 경로: textarea 수동 입력 → 폴더 찾아보기 + 경로 목록 UI
- `NewSessionModal.jsx` — SSH 모드에서 프로젝트 경로 옆 "찾아보기" 버튼 추가

**Windows 경로 호환성:**
- `validateRemotePath()` — Windows 경로 구분자(`\`) 및 대소문자 무시 비교 추가
- SSHFS Windows 경로 변환: `C:\work\test` → `/C:/work/test` (SFTP 형식)
- SFTP browse에서 Windows 드라이브 목록 지원

**HTTPS 설정:**
- nginx reverse proxy 설정: `work.forelinkapp.com` → `localhost:3000`
- Let's Encrypt SSL 인증서 (certbot)
- HTTP → HTTPS 자동 리다이렉트
- WebSocket 프록시 지원 (`Upgrade`, `Connection` 헤더)

**권한 처리:**
- `--dangerously-skip-permissions` 플래그 추가 (웹 환경에서 터미널 권한 프롬프트 불가)
- 보안은 웹 앱 자체의 인증(JWT), 경로 제한(allowed_paths), 사용자 격리로 처리

**의존성:**
- 시스템: `fuse-sshfs`, `sshpass` 패키지 설치 필요

---

## 2026-03-14

### 3. [2차] SSH 모드 구현

원격 서버에 SSH로 접속하여 Claude Code를 실행할 수 있는 모드 추가.

**DB 변경:**
- `ssh_profiles` 테이블 추가 (호스트, 포트, 사용자명, 암호화된 인증 정보, 허용 경로)
- `sessions` 테이블에 `ssh_profile_id` 컬럼 추가 (마이그레이션)

**백엔드:**
- `server/src/utils/crypto.js` — AES-256-GCM 기반 SSH 자격 증명 암호화/복호화
- `server/src/services/sshProfileManager.js` — SSH 프로필 CRUD, 경로 검증, 자격 증명 관리
- `server/src/routes/sshProfiles.js` — SSH 프로필 REST API + 연결 테스트 엔드포인트
- `server/src/services/processManager.js` — `SSHProcessWrapper` 클래스, `sendMessageSSH()` 함수 추가
- `server/src/ws/wsHandler.js` — `work_mode === 'ssh'`일 때 SSH 경로로 분기
- `server/src/services/sessionManager.js` — SSH 모드 세션 생성 시 프로필 검증, 원격 경로 검증
- `server/src/services/auditLogger.js` — SSH 관련 감사 로그 액션 추가
- 의존성: `ssh2` 패키지 추가

**프론트엔드:**
- `client/src/stores/sshProfileStore.js` — SSH 프로필 Zustand 스토어
- `client/src/components/Settings/SshProfileForm.jsx` — SSH 프로필 생성/수정 폼 (연결 테스트 포함)
- `client/src/components/Settings/SettingsPage.jsx` — SSH 프로필 관리 섹션 추가
- `client/src/components/Session/NewSessionModal.jsx` — 로컬/SSH 모드 토글, SSH 프로필 선택
- `client/src/components/Session/SessionItem.jsx` — SSH 세션 배지 표시
- `client/src/stores/sessionStore.js` — `sshProfileId` 파라미터 지원
- `client/src/api/client.js` — SSH 프로필 API 메서드 추가

---

### 1. [버그 수정] Claude CLI `-p` 모드에서 대화형 모드로 fallback되는 문제

**파일:** `server/src/services/processManager.js`

**증상:**
- 세션 생성 후 메시지를 보내면 ANSI 이스케이프 코드가 포함된 Claude Code welcome 화면만 출력되고, 이후 응답이 오지 않음
- `[?2004h[?1004h[?25l...` 등 터미널 제어 시퀀스가 raw 텍스트로 전달됨

**원인:**
- `claude -p` (print mode)에서 `--output-format stream-json`을 사용하려면 `--verbose` 플래그가 필수
- `--verbose` 없이 실행 시 에러가 발생하며, 대화형(interactive) 모드로 fallback
- `stdio: ['ignore', 'pipe', 'pipe']`로 stdin이 차단되어 있어 대화형 모드에서 입력을 받지 못하고 프로세스가 무한 대기

**수정:**
- spawn 인자에 `--verbose` 플래그 추가

---

### 2. [기능 개선] 응답 실시간 스트리밍 지원

**파일:** `server/src/services/processManager.js`, `server/src/ws/wsHandler.js`

**증상:**
- Claude의 응답이 실시간으로 토큰 단위로 전달되지 않고, 전체 응답이 완료된 후 한번에 전달됨
- 클라이언트에서 `...` thinking 표시만 보이다가 갑자기 전체 텍스트가 출력됨

**원인:**
- `--output-format stream-json --verbose`만으로는 최종 완성된 `assistant` 메시지 하나만 출력됨
- 토큰 단위 스트리밍을 위해서는 `--include-partial-messages` 플래그가 필요
- 이 플래그를 추가하면 `stream_event` 타입으로 `content_block_delta` (text_delta) 이벤트가 토큰 단위로 출력됨

**수정:**

`processManager.js`:
- spawn 인자에 `--include-partial-messages` 플래그 추가

`wsHandler.js`:
- `extractText()` 함수 리팩토링:
  - `stream_event` → `content_block_delta` → `text_delta` 경로를 최우선 처리
  - 중복 방지를 위해 partial `assistant` 메시지는 무시
- `result` 타입 fallback 추가: stream_event가 없었을 경우 `result.result`에서 텍스트 추출
- `ws.readyState` 체크 추가: WebSocket 연결이 끊긴 후 send 시도 시 에러 방지
- non-JSON 출력 무시 처리 (ANSI 코드 등 불필요한 데이터 필터링)

---

## 2026-03-13

### 초기 구현 (Initial commit)

- Express + WebSocket 서버 구축
- React + Vite 클라이언트 구축
- JWT 기반 인증 (회원가입/로그인/로그아웃)
- 세션 관리 (CRUD, 동시 3개 제한, heartbeat/idle timeout)
- Claude Code CLI 프로세스 관리 (spawn, write, resize, kill)
- WebSocket 실시간 통신
- 대화 히스토리 SQLite 저장/조회
- 파일 업로드/다운로드
- 감사 로그
- xterm.js 터미널 UI
