# Claude Code Web — 변경 이력

---

## 2026-03-14

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
