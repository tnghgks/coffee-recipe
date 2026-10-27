# drip-community
핸드드립 레시피 공유 커뮤니티 + 추출 도구(비율 계산기, 추출 타이머, 브루 로그).
전체 계획: docs/PLAN.md

@AGENTS.md

## 스택
Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase(Postgres/Auth/Storage),
Zod, React Hook Form, Zustand, TanStack Query, Vitest, Playwright, pnpm

### 설치 버전 (Phase 0, 2026-10-11)
| 패키지 | 버전 |
| --- | --- |
| Node | 22 (`.nvmrc`) |
| pnpm | 12.9.1 (`packageManager`) |
| next | 16.4.0 (Cache Components·Partial Prefetching 켜짐) |
| react / react-dom | 19.3.0 |
| typescript | 5.9.3 |
| tailwindcss | 4.3.3 |
| shadcn (CLI, style `base-nova`) | 4.21.4 — 프리미티브는 `@base-ui/react` 1.9.0, 아이콘 `lucide-react` |
| @supabase/supabase-js | 2.117.3 |
| @supabase/ssr | 0.12.7 |
| supabase (CLI, devDependency) | 2.120.0 |
| vitest | 5.0.3 |
| @playwright/test | 1.64.0 |
| eslint | 9.39.5 |
| oxfmt | 0.72.0 (생성 타입 포맷용) |
| zustand | 5.0.15 (Phase 2) |
| zod | 4.6.5 (Phase 3) |
| react-hook-form / @hookform/resolvers | 7.89.0 / 5.9.1 (Phase 3) |
| @dnd-kit/core · sortable · utilities | 6.3.1 · 10.0.0 · 3.2.2 (Phase 3, 단계 드래그 정렬) |
| @tanstack/react-query | 5.104.1 (Phase 5, 탐색 무한 스크롤) |

| esbuild | 0.28.2 (Phase 6-A, 서비스 워커 번들) |

Serwist는 쓰지 않는다 (Phase 6-A): Turbopack 연동(@serwist/turbopack)이 Route Handler의 `dynamic`·`revalidate` 세그먼트 설정에 기대는데 Cache Components와 같이 못 쓴다. 서비스 워커는 직접 작성한다.

## 구조
src/app/            루트 layout은 html/body/폰트만. 라우트는 그룹으로 나눈다 (URL에는 안 나옴)
src/app/(main)/     헤더·하단 내비가 있는 일반 화면
src/app/(focus)/    헤더·내비 없는 전체 화면 (추출 모드 /recipes/[id]/brew)
src/features/<도메인>/  recipe, brew, log, community, home(홈 화면 조합) — components, actions.ts, schema.ts, queries.ts
public/images/      레시피 사진 (recipes/<공식 id>.webp, drippers/<slug>.webp). docs/recipe-images.md
src/components/ui/  shadcn 컴포넌트 (pnpm dlx shadcn@latest add <name>)
src/components/layout/  헤더, 모바일 하단 내비
src/components/common/  여러 도메인이 쓰는 컴포넌트 (NumberStepper 등)
src/config/         site.ts(서비스명·설명), nav.ts(메뉴 항목)
src/lib/supabase/   server.ts(세션), client.ts(브라우저), public.ts(쿠키 없는 anon, use cache용), middleware.ts(updateSession), env.ts, health.ts, database.types.ts(생성)
src/lib/brew/       환산·타이머 순수 함수 (UI 의존 금지, 단위 테스트 필수)
src/proxy.ts        Next 16의 middleware 대체 파일. Supabase 세션 갱신
src/sw/sw.ts        서비스 워커. scripts/build-sw.mjs(esbuild)가 public/sw.js로 묶는다 (생성 파일, 커밋 안 함). 타입 검사는 tsconfig.sw.json
src/lib/pwa/        서비스 워커와 앱이 같이 쓰는 캐시 규칙 (순수 함수, 단위 테스트)
src/features/pwa/   서비스 워커 등록·메시지, 설치 배너, 오프라인 배너·목록
supabase/migrations/  모든 스키마 변경
e2e/                Playwright 테스트

## 규칙
- 데이터 변경은 Server Action + Zod 검증. 클라이언트에서 직접 insert 금지.
- 스키마 변경 시: 마이그레이션 추가 → pnpm db:types → 타입 커밋.
- 새 테이블은 RLS 활성화 + 정책을 같은 마이그레이션에 작성.
- 레시피 물량은 원두량 대비 배수로 저장하고 표시할 때 환산.
- 타이머 경과 시간은 시작 시각 기준 performance.now() 차이로 계산 (setInterval 누적 금지).
- UI 문구는 한국어, 코드·커밋 메시지는 영어.
- 완료 전 pnpm lint && pnpm typecheck && pnpm test 통과.
- 테스트 역할: Vitest(node 환경)는 순수 함수만, 화면 흐름은 Playwright, 권한은 pgTAP. 컴포넌트 단위 테스트가 필요해지면 그때 jsdom·Testing Library를 다시 들인다.

### Next.js 16 주의점 (Phase 0에서 확인)
- 학습 데이터와 API가 다르다. 코드 작성 전 `node_modules/next/dist/docs/`의 해당 문서를 확인한다.
- `middleware.ts`는 폐기되고 `proxy.ts`(export `proxy`)로 바뀌었다.
- Cache Components가 켜져 있다. `cookies()`·`headers()`·Supabase 서버 클라이언트를 쓰는 컴포넌트는 반드시 `<Suspense>` 안에 두고, 레이아웃 최상단에서 세션을 await하지 않는다. 요청마다 실행해야 하면 `await connection()`.
- 동적 파라미터 라우트 아래에서 `usePathname`은 suspend된다. 내비처럼 레이아웃에 있는 클라이언트 컴포넌트는 Suspense로 감싼다 (`src/components/layout/nav-links.tsx` 참고).
- `LayoutProps`·`PageProps` 전역 타입은 `next typegen`이 만든다. `pnpm typecheck`가 먼저 실행한다.

### Supabase
- 환경변수는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(구 anon key), 서버 전용 `SUPABASE_SECRET_KEY`(구 service role key).
- 서버에서 사용자 확인은 `supabase.auth.getClaims()`를 쓴다 (`getSession()`은 서버에서 신뢰하지 않는다).
- 환경변수가 없으면 proxy는 세션 갱신을 건너뛰고, `/status` 페이지가 연결 실패를 표시한다.

### DB (Phase 1-A에서 정함)
- 생성 타입: `src/lib/supabase/database.types.ts` (`pnpm db:types`, 직접 수정 금지). 클라이언트는 `createClient`가 `Database` 제네릭을 이미 붙여 둔다.
- RLS 테스트는 pgTAP으로 `supabase/tests/database/*.test.sql`에 쓰고 `pnpm db:test`로 돌린다. 새 테이블마다 "다른 사용자 계정으로 접근" 케이스를 넣는다. CI의 Database 잡이 테스트와 타입 최신 여부를 검사한다.
- 클라이언트가 쓰면 안 되는 컬럼(`like_count`, `save_count`, `is_official`, `search`)은 RLS가 아니라 컬럼 단위 GRANT로 막는다. 쓰기 가능한 컬럼을 추가하면 마이그레이션에서 `grant insert/update (컬럼)`도 같이 추가한다.
- Phase 5의 카운트 갱신 트리거는 컬럼 GRANT를 우회해야 하므로 `security definer` + `set search_path = ''`로 만든다.
- 물량 표기: `recipes.ratio` = 총 물량 ÷ 원두량, `recipe_steps.water_ratio` = 해당 단계까지 누적 물량 ÷ 원두량. 둘 다 numeric(6,3). 마지막 단계 water_ratio = ratio.
- 아이스 변환은 저장하지 않고 화면에서 계산한다: `scaleRecipe(..., { iceShare })`. 총 물량(원두 × 비율)은 그대로, 그중 `iceShare`(기본 40%)를 얼음으로, 단계 물량은 같은 비율로 줄인다. 추출 모드(Phase 2)로 넘길 때 원두량·비율과 함께 핫/아이스도 넘긴다.
- 드리퍼 용량: `drippers.size_label` + `max_dose_g`(대표 사이즈 기준 권장 최대 원두량, 시드에서 관리). 넘으면 추출 준비 화면에서 안내만 하고 막지 않는다 (`exceedsCapacity`).
- 공식 레시피: `is_official = true`, `author_id = null`, 항상 public. 시드 id는 `00000000-0000-4000-8000-0000000000NN`로 고정. 유명 레시피는 수치만 쓰고 `source_name`(·`source_url`)으로 출처를 표기하고 `source_note`(≤200자)에 원작자 소개를 1~2줄 쓴다. 설명·소개는 직접 작성.
- 시드는 `supabase/seed.sql` → `pnpm db:reset`으로 다시 넣는다.

### 데이터 조회 (Phase 1-C에서 정함)
- 방문자와 무관한 공개 데이터는 `features/<도메인>/queries.ts`에서 `createPublicClient()` + `"use cache"` + `cacheLife`/`cacheTag`로 읽는다. 태그는 `recipeTags`를 쓰고, 데이터를 바꾸는 Server Action에서 같은 태그로 무효화한다.
- 세션이 필요한 데이터(내 private 레시피 등)는 `lib/supabase/server.ts` 클라이언트로 읽고 `use cache`를 쓰지 않는다.
- DB를 읽는 페이지는 `params`/`searchParams`를 await하고 `loading.tsx`를 둔다. 그래야 빌드 시점에 DB를 호출하지 않는다 (Vercel·CI 빌드에는 DB가 없다). `generateStaticParams`로 DB를 읽지 않는다.
- 쿼리 결과는 snake_case DB 행을 camelCase 도메인 타입(`features/<도메인>/types.ts`)으로 바꿔서 반환한다.
- 쿼리스트링은 `search-params.ts`의 파서로 정규화하고, 잘못된 값은 에러 대신 기본값으로 둔다.
- E2E는 로컬 Supabase 시드에 의존한다. CI E2E 잡도 Supabase를 띄우고 `.env.local`을 만든다.

### 추출 타이머 (Phase 2-A에서 정함)
- 상태 머신은 `src/lib/brew/session.ts`: idle → ready → running ⇄ paused → finished. idle은 준비 화면, ready는 추출 화면을 0:00으로 띄워 두고 탭을 기다린다. 세션은 "쌓인 ms + 마지막 재개 시각(performance.now())"만 저장하고 경과 시간은 매번 계산한다. 모든 함수는 `now`를 인자로 받는다.
- 단계 위치는 `src/lib/brew/progress.ts`의 `getBrewProgress(steps, totalTimeS, elapsedS)`. 마지막 붓기 이후~총 시간은 마지막 단계의 구간이다. 끝 시각은 `brewEndS`(총 시간과 마지막 단계 시작 중 큰 값).
- `src/features/brew/store.ts`의 `createBrewStore(clock)`는 위 함수에 `now`만 넣어 주는 얇은 래퍼다. 화면마다 인스턴스를 만들고(전역 싱글턴 아님), 매 프레임 `completeIfDue(endMs)`로 종료를 판정한다.

### 추출 화면 (Phase 2-B에서 정함)
- 원두량·비율·핫/아이스는 쿼리스트링(`?dose=&ratio=&iced=1`)에 둔다. 추출 준비 화면이 `history.replaceState`로 바로 고치고(`useLocationSearch`), 상세 ↔ 추출 링크가 그대로 넘긴다. 파싱·생성은 `features/brew/settings.ts`만 쓴다 (레시피 값과 같으면 생략, 범위 밖이면 레시피 값).
- 알림 판단은 순수 함수 `lib/brew/cues.ts` (3·2·1초 틱, 단계 전환, 완료). 소리·진동·Wake Lock 같은 브라우저 API는 `features/brew/feedback.ts`, `hooks.ts`에만 둔다.
- 화면 갱신은 rAF로 하되 리렌더는 ~10fps로 묶는다 (배터리). 알림·종료 판정은 매 프레임.
- Web Audio는 시작/재개 탭 안에서 `unlock()`해야 iOS에서 소리가 난다. iOS Safari는 진동 미지원이라 소리만.
- E2E는 `page.clock`으로 시간을 돌린다. 긴 시간은 `fastForward` 후 짧은 `runFor`로 (프레임을 하나하나 돌리면 느리다).
- 개발 서버의 Next dev indicator는 꺼 두었다 (`devIndicators: false`). 화면 모서리 버튼을 가려 E2E 클릭을 막았다.

### 인증 (Phase 3-A에서 정함)
- 로그인: Google·Kakao OAuth (`signInWithOAuth` → `/auth/callback`에서 code 교환). 로컬은 `supabase/config.toml`의 `[auth.external.*]`를 켜고 키는 `supabase/.env`(gitignore)에 둔다.
- 개발용 이메일 로그인: `NEXT_PUBLIC_DEV_LOGIN=1`일 때만 /login에 보인다 (로컬 .env.local, CI). Vercel에는 절대 넣지 않고, 클라우드 Supabase는 이메일 로그인을 꺼 둔다. E2E는 이 로그인을 쓴다.
- `profiles`: 가입 트리거가 만들고(OAuth 이름·사진 채움) `username`은 첫 로그인 후 /me/setup에서 정한다. 행 추가는 트리거만, 수정은 본인만, `id`는 수정 불가 (컬럼 GRANT).
- 세션 읽기는 `features/auth/queries.ts` (`getCurrentUser`, `getMyProfile`, `requireProfile`)만 쓴다. React `cache()`로 요청당 1번. 서버 클라이언트(`lib/supabase/server.ts`)는 `await connection()` 후 만든다 (안 하면 supabase-js가 프리렌더 중 Date.now()를 불러 경고).
- 보호 경로는 `features/auth/paths.ts`의 `PROTECTED_PREFIXES` (지금 /me). proxy가 비로그인을 /login?next=로 보내고, 페이지는 `requireProfile`로 다시 확인한다.
- 로그인 후 이동은 항상 `safeNextPath`로 거른다 (외부 URL 차단). next가 없으면 홈으로.
- `"use server"` 파일의 export는 전부 클라이언트에서 호출 가능한 엔드포인트가 된다. 액션이 아닌 헬퍼는 `queries.ts` 같은 server-only 파일에 둔다.
- Next 라우트 안내(route announcer)도 role="alert"라서 E2E에서 `getByRole("alert")`는 2개가 잡힌다. 메시지는 텍스트로 찾는다.

### 레시피 에디터 (Phase 3-B에서 정함)
- 저장은 DB 함수 `save_recipe(recipe, steps, recipe_id?)` 하나로. 드리퍼는 `dripper_slug`로 보내고 함수가 id를 찾는다 (앱의 캐시된 드리퍼 id는 재시드 후 낡을 수 있다) (레시피 + 단계를 한 트랜잭션). `security invoker`라 RLS·컬럼 GRANT가 그대로 적용되고, 남의 레시피 수정은 행이 안 보여 P0002로 실패한다. 단계 순서(시간·물량 역행 금지)도 함수 안에서 한 번 더 막는다.
- 에디터 스키마는 `features/recipe/editor-schema.ts` 하나를 폼과 Server Action이 같이 쓴다. 입력은 누적 g·m:ss, 저장은 `water_ratio`·초. 마지막 단계 = 원두 × 비율 ± 2g.
- 공개 데이터 읽기는 `queries.ts`(캐시), 내 레시피·비공개 읽기는 `my-queries.ts`(세션, 캐시 없음). 둘이 쓰는 컬럼·매핑은 `mappers.ts`. 상세·추출 페이지는 `getRecipeForViewer`(공개 → 없으면 내 비공개).
- 복제는 `/recipes/new?fork=<id>`로 미리 채우고 저장할 때 `forked_from`을 남긴다. 상세에 "원본" 링크.
- 편집/새 레시피는 proxy가 보호한다 (`/recipes/new`, `/recipes/*/edit`). 남의 레시피 편집 URL은 404.
- **Next 16은 지나온 페이지를 숨긴 채(display:none) DOM에 남겨 둔다** (뒤로가기 상태 보존). 그래서 폼 `id`는 고정 문자열 금지 → `useId()`로 만든다 (안 그러면 `<label for>`가 숨은 페이지의 input을 가리킨다). E2E에서 `getByText`·`getByTestId` 배열은 숨은 페이지까지 잡으니 `getByRole("article")` 등으로 범위를 좁히거나 `.filter({ visible: true })`.
- dnd-kit `DndContext`에는 `id={useId()}`를 준다 (안 그러면 hydration mismatch).
- onSubmit으로 처리하는 클라이언트 폼(react-hook-form)은 내용을 `HydrationFieldset`으로 감싼다. 하이드레이션 전에는 입력이 비활성화된다. 안 그러면 SSR된 input에 먼저 친 내용이 RHF 기본값 등록 때 덮여 섞이고("기존값+새값" 저장), 이른 제출은 네이티브 GET으로 값이 URL에 남는다. Server Action을 `action`으로 쓰는 폼은 JS 없이도 동작하므로 필요 없다.
- 토큰은 유효한데 profiles 행이 없으면(삭제된 계정) 비로그인으로 취급한다. 로그인 페이지·헤더는 `getMyProfile()`로 판단 (`getCurrentUser()`만 보면 /login ↔ /me 무한 리다이렉트).
- E2E는 `e2e/fixtures.ts`의 `test`를 쓴다. 브라우저 콘솔 에러·uncaught 예외가 있으면 테스트가 실패한다 (dev 전용 경고를 놓치지 않게). 로그인 헬퍼는 `e2e/helpers.ts`.
- pgTAP에서 전체 행 수를 세지 않는다. 로컬 DB에는 E2E가 만든 데이터가 섞여 있다 → 픽스처 id로 범위를 좁힌다.

### 브루 로그 (Phase 4에서 정함)
- `brew_logs`는 본인만 읽고 쓴다 (anon은 테이블 접근 자체가 없음). `user_id`는 기본값 `auth.uid()`, 수정 불가. 레시피가 지워져도 로그는 남는다 (`recipe_id` set null).
- `water_g`는 컵 전체 물(아이스면 얼음 포함). 평점만 필수, 나머지는 선택 → 종료 화면 "기록 남기기" → 별점 → 저장 3탭.
- 추출 → 기록은 `features/log/prefill.ts`의 `newLogHref`/`logDefaultsFromQuery`로 쿼리스트링을 주고받는다. 폼이 /me 아래라 비로그인은 로그인(→ 첫 설정) 후 같은 URL로 돌아온다.
- 날짜는 `formatBrewedAt`으로 Asia/Seoul 고정 포맷 (서버 UTC와 브라우저가 같게).
- 지난 "다음엔" 메모(`LastAdjustmentNote`)는 추출 준비 화면, 내 기록 3개(`MyRecipeLogs`)는 레시피 상세 맨 아래. 둘 다 세션을 읽어서 각각 Suspense.
- 로그인·로그아웃·프로필 저장 액션은 `revalidatePath("/", "layout")`를 부른다. 레이아웃(헤더 아바타)은 이동해도 유지되므로 안 하면 새로고침 전까지 옛 상태가 보인다.

### 커뮤니티 (Phase 5에서 정함)
- 5-A: `/recipes`는 **공식 레시피만** (`listOfficialRecipes`). 사용자 공개 레시피는 `/u/[username]`과 `/explore`(5-B)에 나온다.
- 공개 범위: private(나만) · unlisted(링크로만, 목록·프로필에 안 나옴, 상세는 noindex) · public. 편집은 기존 값을 유지하고 복제는 private으로 시작.
- 레시피 조회는 작성자(`profiles` embed)를 함께 가져온다 (`mappers.ts`의 `author`). 카드 안에서는 링크 중첩을 피하려고 `AuthorLabel`, 그 밖에서는 `AuthorLink`.
- 공개 프로필·작성자 정보가 들어간 캐시는 `recipeTags.profiles` 태그를 단다. 프로필 저장 시 `updateTag(recipeTags.profiles)`.
- 5-B 탐색: `/explore` = 공개 레시피 전체(공식 포함). DB 함수 `explore_recipe_ids`가 검색·필터·정렬·키셋 페이지네이션을 하고, 상세 컬럼은 `summaryColumns`로 따로 가져온다.
- 검색은 `websearch_to_tsquery('simple')`(사용자 입력에 절대 에러 안 남) OR 제목 ILIKE(한글 부분 일치, `%`·`_` 이스케이프). "4:6"도 동작.
- 인기 점수 `recipe_hot_score` = (좋아요 + 2×저장 + 1) / (경과시간h + 2)^1.5. 계산 기준 시각 `at`은 10분 단위로 내림(첫 페이지 캐시 공유)하고 커서에 실어 같은 피드의 모든 페이지가 같은 순위를 쓴다.
- **커서의 정렬 키는 정수(bigint)**: 점수 × 1e9, 최신은 epoch 마이크로초. float 키는 JSON 왕복 중 반올림돼 경계 행이 다음 페이지에 또 나왔다.
- 첫 페이지는 서버 렌더링, 다음 페이지는 `/api/explore`(GET) + TanStack Query `useInfiniteQuery` + IntersectionObserver("더 보기" 버튼 fallback). 검색창은 GET form이라 JS 없이도 동작.
- 시각을 읽는 코드(`Date.now()`)가 렌더 경로에 있으면 먼저 `await connection()`. 안 하면 Cache Components 프리렌더 검증이 콘솔 에러를 낸다 (E2E 콘솔 가드가 잡는다).
- 공식 레시피 시드 22개 (PLAN 리스크 대응 "20개 이상"). E2E에서 공식 레시피 수를 셀 때 22.
- 5-C 좋아요·저장: `recipe_likes`·`recipe_saves`(복합 PK). 행은 **본인만 조회**(PLAN의 "누구나 조회"에서 바꿈: 합계는 recipes 카운트로 충분하고 누가 뭘 눌렀는지는 숨긴다). 쓰기는 `set_recipe_reaction(target, kind, active)` 하나 — 토글이 아니라 원하는 상태를 보내서 연타·재시도가 마지막 클릭으로 수렴하고, 새 합계를 돌려준다.
- 카운트(`like_count`·`save_count`·`fork_count`)는 security definer 트리거가 `count ± 1`로 갱신 (행 잠금으로 동시 요청 직렬화, 0 미만 방지). `updated_at` 트리거는 작성자가 고치는 컬럼에만 걸어서(`before update of …`) 카운트 변경이 "내 레시피" 정렬을 흔들지 않는다. 편집 가능한 컬럼을 추가하면 이 목록에도 넣는다.
- 포크는 볼 수 있는 레시피만 (`recipes_check_fork_source` 트리거, security invoker라 호출자 RLS로 확인). 정책에서 같은 테이블을 조회하면 infinite recursion이라 트리거로 했다.
- 버튼은 낙관적 업데이트 + 가장 최근 요청의 응답만 반영 (`features/community/components/reaction-buttons.tsx`). 상세의 카운트·눌림 상태는 세션으로 새로 읽고(Suspense, fallback은 캐시된 카운트), 액션은 캐시를 무효화하지 않는다 (목록 카드의 카운트는 캐시 수명만큼 늦을 수 있음).
- **PostgREST 임베드는 FK 이름을 붙인다**: likes·saves가 recipes와 profiles를 둘 다 참조해서 `profiles(...)`가 모호해졌다 → `profiles!recipes_author_id_profiles_fkey(...)`. 두 테이블을 잇는 테이블을 또 만들면 같은 문제가 난다.
- 5-D 댓글: `comments`는 레시피를 볼 수 있으면 조회, 본인만 수정·소프트 삭제(하드 삭제 권한 없음). 삭제는 `deleted_at`만 보내면 트리거가 시각을 찍고 본문을 비운다(체크 제약: 삭제 전 1~1000자, 삭제 후 ""). 삭제된 댓글은 다시 고칠 수 없다(RLS USING).
- 댓글 rate limit: 사용자당 1분 5개, insert 트리거(security definer + advisory lock)가 `P0429`로 막는다. 액션이 이 코드를 한국어 안내로 바꾼다.
- 댓글 목록은 세션으로 읽고 캐시하지 않는다. 작성·수정·삭제 액션은 `refresh()`(next/cache)로 화면을 다시 그린다.
- 폼 액션 패턴: `useActionState` + 결과마다 `n`을 올려 textarea를 re-key, 실패 시 서버가 `body`를 돌려줘 입력을 살린다 (React 19는 액션 후 폼을 리셋한다). 클라이언트 함수 액션이라 `HydrationFieldset`으로 감싼다.
- 신고: `reports`(대상 recipe|comment, 사유 enum, 사람당 대상당 1건). 작성은 로그인 사용자(대상이 보여야 함, invoker 트리거), 조회·처리는 관리자만. 중복 신고는 사용자에게 성공과 같게 보인다.
- 관리자: `profiles.role`(user|admin), UPDATE 권한이 없어 SQL로만 바꾼다. DB는 `public.is_admin()`, 앱은 `isAdmin()`/`requireAdmin()`(`features/auth/queries.ts`, 아니면 404).

### PWA (Phase 6-A에서 정함)
- 서비스 워커는 **프로덕션 빌드에서만** 등록한다 (`SERVICE_WORKER_ENABLED`). `pnpm build`가 먼저 `public/sw.js`를 만든다 (`pnpm sw`로 따로도 가능).
- 캐시: `/_next/static` cache-first(400개), 페이지 HTML network-first(80개, 경로 기준이라 쿼리 무시), 아이콘·manifest·/offline은 설치 때. 캐시할 페이지는 `isCacheablePage` 허용 목록 (홈, /recipes, 레시피 상세·추출, /me/saved, /offline). 폼·로그·관리 화면은 캐시하지 않는다.
- 클라이언트 이동(RSC 요청)은 캐시하지 않는다. 오프라인이면 SW가 503 text/plain을 돌려주고, Next는 그걸 보고 전체 페이지 로드로 바꿔서 캐시된 HTML이 열린다 (fetch를 실패시키면 같은 결과지만 콘솔 에러가 남는다).
- 미리 받아 두기: 레시피 상세를 열면 상세+추출 화면을, /me/saved를 열면 저장한 레시피 전부를 `CacheForOffline` → SW가 HTML과 그 안의 `/_next/static` 파일까지 받는다. 10분 안에 받은 페이지는 다시 받지 않는다 (/me/saved 제외).
- 추출 화면은 브라우저에서 URL의 `?dose=&ratio=&iced=`를 다시 읽는다 (오프라인 캐시는 쿼리 없이 저장되므로).
- 로그아웃하면 캐시된 페이지를 지운다 (`SignOutForm` → `CLEAR_PAGES`).
- 한글 폰트(Noto Sans KR)는 글자 범위별로 쪼개져 필요할 때만 받는다. 오프라인에서 처음 쓰는 글자는 시스템 폰트로 보인다 (전부 미리 받으면 수 MB).
- 설치 배너: 추출 시작 2회 후 한 번만 (localStorage). Chrome은 `beforeinstallprompt`를 잡아 두었다가 "설치" 버튼, iOS는 "공유 → 홈 화면에 추가" 안내.
- E2E: `e2e/pwa.spec.ts`는 Playwright `pwa` 프로젝트가 `pnpm build && pnpm start --port 3100`에서 돌린다 (`context.setOffline`). 이미 띄워 둔 서버를 쓰려면 `PLAYWRIGHT_PWA_URL`. 오프라인 테스트처럼 예상된 콘솔 에러는 `test.use({ allowConsoleError: /…/ })` (배열은 Playwright가 튜플로 읽어서 RegExp 하나).
- 레시피 사진(`/_next/image?url=/images/…`)은 별도 캐시(120개) cache-first. 페이지를 미리 받을 때 사진마다 한 폭(640 이상 중 가장 작은 것)만 받고, 오프라인에서는 같은 사진의 캐시된 아무 폭이나 준다 (`extractImagePaths`·`imageFallback`).

### 추출 준비·링 타이머 (추출 준비 화면 작업에서 정함)
- 비율 계산기는 레시피 상세가 아니라 추출 화면의 준비 단계(idle, `BrewPrep`)에 있다. 상세는 레시피 그대로(원두·비율·물 칩 + 단계)와 "추출하기" 링크만.
- 준비 화면의 "추출 시작" 버튼은 추출 화면으로만 넘긴다(ready). 타이머는 링 화면을 탭해야 시작한다 (물 붓기와 맞추려고). 화면 전체 탭은 추출 화면에서만: 시작/일시정지/계속. 추출 화면에 들어가면 설정을 못 바꾼다. "다시 내리기"는 준비 화면으로 돌아간다. E2E는 "추출 시작" 뒤에 "타이머 시작" 버튼을 누른다.
- 추출 중 화면은 링(`BrewRing`): 총 시간을 단계별 호로 나눈다(`brewSegments`, 순수 함수). 가운데는 목표 g, 다음 붓기 3초 전부터 링 머리가 깜박이고 카운트다운이 커진다.
- Next가 떠난 추출 화면을 숨긴 채 살려 두므로, 레시피로 돌아가는 링크는 세션을 reset한다 (안 하면 다시 들어왔을 때 이전 추출이 이어진다).

### 홈·레시피 사진 (refactor/home-layout에서 정함)
- 홈 = 위쪽(세션) + 인기·신규(공개, 캐시). 위쪽은 비로그인이면 히어로, 로그인이면 인사 + "지난번에 내린 레시피"(`getLastBrew`) + 저장/좋아요 탭. 각각 Suspense.
- 인기·신규는 `/explore` 첫 페이지(`exploreRecipes`)를 그대로 잘라 쓴다 → 순위가 탐색 화면과 같고 캐시도 공유한다.
- "다시 추출"은 로그의 원두량·물·아이스를 `brewSettingsFromLog`로 바꾼다. 로그는 g만 저장하므로 물이 레시피 비율과 반올림 오차(±0.5g) 안이면 레시피 비율을 그대로 쓴다.
- 레시피 사진은 미리 만든 정적 파일(`public/images`, `docs/recipe-images.md`의 프롬프트로 imagen 생성). 공식 레시피는 자기 사진, 나머지는 드리퍼 사진, 모르는 드리퍼는 `default`. 매핑은 `features/recipe/images.ts`. **공식 레시피·드리퍼를 추가하면 사진도 추가**한다 (단위 테스트가 파일 존재와 seed의 드리퍼 slug를 확인).
- `next.config.ts`의 `images.localPatterns`는 `/images/**`만 허용한다.
- 좋아요·저장 수는 `formatCount`로 줄여 쓴다 ("1.2천", "1.2만").
- 가로 스크롤 목록 안에 `sr-only`(absolute)가 있으면 스크롤 컨테이너에 `relative`를 준다. 안 그러면 기준 위치가 바깥이라 페이지 폭이 늘어난다 (모바일에서 가로 스크롤).

### 저장소·배포
- GitHub `tnghgks/coffee-racipe`. Phase 하나 = 브랜치(`phase-N`) 하나 = PR 하나, base는 `main`.
- CI(`.github/workflows/ci.yml`): Lint · Typecheck · Test 통과 후 E2E. Supabase 없이 돈다.
- Vercel은 `vercel.json`으로 framework를 `nextjs`로 고정했다 (프로젝트를 빈 main으로 import해서 프리셋이 "Other"로 잡혔던 문제).
- Vercel 프리뷰는 Deployment Protection이 켜져 있어 Vercel 로그인 상태에서만 열린다.
- 프로덕션 DB(클라우드 Supabase, `supabase link`됨)는 머지 후 `pnpm exec supabase db push`로 마이그레이션을 반영한다. **`seed.sql`은 push로 들어가지 않는다** → 공식 레시피를 추가하면 새 행만 `on conflict do nothing`으로 따로 넣는다.
- 줄바꿈은 `.gitattributes`로 LF 고정 (로컬 git의 autocrlf 무시).

## 명령어
pnpm dev | pnpm test | pnpm e2e | pnpm typecheck | pnpm lint
pnpm db:start | pnpm db:stop | pnpm db:reset | pnpm db:types | pnpm db:test   (Supabase CLI는 pnpm exec supabase …, Docker 필요)
