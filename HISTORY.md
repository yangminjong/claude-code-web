# Claude Code Web — 변경 이력

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
