# MDS CompDocs — Figma Plugin 규칙 및 디자인 가이드

## 플러그인 개요
- 이름: MDS CompDocs
- 용도: Figma에서 COMPONENT_SET 또는 COMPONENT를 선택하면 상세 가이드 페이지를 자동 생성하고, Confluence 위키에 발행
- 파일 구조: `manifest.json`, `code.js` (plugin sandbox), `ui.html` (UI iframe)

---

## Figma 가이드 페이지 생성 규칙

### 메인 프레임
- 너비: **1280px** (고정), 높이: AUTO
- 레이아웃: VERTICAL auto-layout
- 패딩: top/bottom **100**, left/right **80**
- 섹션 간격 (itemSpacing): **60**
- 배경: **#FFFFFF**
- 코너: **36px**

### 폰트
- 폰트 패밀리: **Inter** (모든 텍스트)
- 사용하는 스타일: Extra Bold, Bold, Semi Bold, Medium, Regular
- 반드시 `figma.loadFontAsync()`로 사전 로드 필요

### 컬러 팔레트

| 용도 | RGB | Hex |
|---|---|---|
| 타이틀 / 헤딩 텍스트 | `rgb(17, 17, 34)` | `#111122` |
| 설명 / 서브 텍스트 | `rgb(85, 85, 122)` | `#55557A` |
| 배경 (미리보기 박스, 테이블 헤더) | `rgb(248, 249, 250)` | `#F8F9FA` |
| 기본 태그 배경 | `rgb(240, 240, 245)` | `#F0F0F5` |
| Default 태그 배경 | `rgb(230, 249, 238)` | `#E6F9EE` |
| Default 태그 텍스트 | `rgb(3, 169, 77)` | `#03A94D` |
| 테이블 텍스트 | `rgb(46, 46, 46)` | `#2E2E2E` |
| 에러 텍스트 (fallback) | `rgb(153, 153, 184)` | `#9999B8` |
| 가이드 박스 (anatomy) | `rgba(180, 60, 200, 0.06)` fill / `rgba(180, 60, 200, 0.45)` stroke | 보라/핑크 |
| 테이블 border | `rgba(0, 0, 0, 0.15)` | — |
| 테이블 row border | `rgba(0, 0, 0, 0.08)` | — |

### 타이포그래피 규격

| 요소 | 크기 | Weight | 색상 |
|---|---|---|---|
| 컴포넌트 제목 | **64px** | Extra Bold | `#111122` |
| 컴포넌트 설명 | **16px** | Regular | `#55557A` |
| 섹션 제목 (Measurement, Properties) | **28px** | Bold | `#111122` |
| 프로퍼티 제목 | **22px** | Bold | `#111122` |
| 프로퍼티 설명 | **16px** | Regular | `#55557A` |
| 태그 텍스트 | **13px** | Medium | `#55557A` or `#03A94D` |
| 테이블 헤더 | **14px** | Bold | `#2E2E2E` |
| 테이블 셀 | **14px** | Regular | `#2E2E2E` |
| 넘버 뱃지 텍스트 | **10px** | Bold | `#111122` |
| Variant 라벨 (grid) | **13px** | Medium | `#55557A` |

---

## 컴포넌트 구조

### 섹션 순서
1. **Title** — 컴포넌트 이름 + 설명
2. **Measurement (Anatomy)** — 선택적. 컴포넌트 인스턴스 + 슬롯 마커 + 슬롯 테이블
3. **Properties** — 프로퍼티별 제목, 설명, 값 태그, variant 이미지 그리드
4. **Example** — 선택적. 다양한 variant 조합 예시 (최대 5개)

### Measurement 섹션
- Anatomy 배경: `#F8F9FA`, 코너 **16px**, `clipsContent: false`
- 너비: 메인 프레임 - 패딩 = **1120px** (1280 - 160)
- 높이: 컴포넌트 높이 + padding **50px** × 2
- 컴포넌트 인스턴스: `.createInstance()`로 생성, 센터 배치

### 넘버 뱃지 (슬롯 마커)
- 크기: **17×17px**, 완전 원형 (`cornerRadius: 100`)
- fill: `rgba(0, 0, 0, 0.04)`
- stroke: `#111122`, strokeWeight: **1.2px**
- 텍스트: 10px Bold

### 슬롯 가이드 사각형
- 크기: **36×36px**
- fill: `rgba(180, 60, 200, 0.06)` (반투명 보라)
- stroke: `rgba(180, 60, 200, 0.45)`, strokeWeight: **1.5px**, 코너 **3px**

### 마커 연결선
- 크기: **20×1.5px**
- fill: `#111122`
- 마커 배치: 홀수 번호는 왼쪽, 짝수 번호는 오른쪽

### 슬롯 테이블
- 코너: **12px**, border: `rgba(0, 0, 0, 0.15)` 1px
- 칼럼: Slots Name (**220px**) | Description (flex) | Value (**220px**)
- 헤더 배경: `#F8F9FA`
- row border: `rgba(0, 0, 0, 0.08)` 하단 1px
- 패딩: 10px 20px
- 최소 3행 보장 (빈 행 자동 추가)

### 태그 (Property Values)
- 패딩: 3px 10px, 코너 **6px**
- 일반: 배경 `#F0F0F5`, 텍스트 `#55557A`
- Default: 배경 `#E6F9EE`, 텍스트 `#03A94D`, 라벨 뒤에 " (default)" 표시

### Variant 이미지 그리드
- 레이아웃: HORIZONTAL, FILL width (stretch)
- 패딩: top/bottom **100px**, left/right **24px**
- 간격: **20px**
- 배경: `#F8F9FA`, 코너 **16px**
- 정렬: primaryAxis CENTER, counterAxis MAX (하단 정렬)
- 각 아이템: VERTICAL auto-layout, 간격 10px, 센터 정렬

---

## 컴포넌트 분석 규칙 (analyzeComponent)

### 대상 노드
- `COMPONENT_SET` — variant 프로퍼티 분석, 각 variant별 이미지 생성
- `COMPONENT` (단독) — 단일 컴포넌트, variant 없음

### 이름 처리
- `comp.` 접두사 제거: `node.name.replace(/^comp\./i, "")`

### Default Variant 결정
- `componentPropertyDefinitions`에서 각 VARIANT 프로퍼티의 `defaultValue` 수집
- 모든 프로퍼티가 default인 variant를 찾음
- 없으면 첫 번째 variant 사용

### Property별 Variant 매칭
- 해당 프로퍼티만 변경하고 나머지는 default 유지하는 variant를 찾음
- variant 이름 파싱: `"Key1=Value1, Key2=Value2"` 형식

### Slot 추출 (extractSlots)
- default variant의 자식 노드를 재귀 탐색
- `visible: false` 또는 이름이 `_`로 시작하는 노드는 제외
- 자식이 1개인 FRAME/GROUP/INSTANCE는 래퍼로 간주하고 재귀 (depth < 3)
- 각 슬롯의 위치를 부모 대비 % 좌표로 기록 (box: x, y, w, h)

---

## 이미지 Export 규칙 (Confluence 발행용)

- 포맷: **PNG**
- 스케일: **2x** (레티나 대응)
- `node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } })`
- base64 인코딩: `figma.base64Encode(bytes)` → `data:image/png;base64,...`
- Anatomy 이미지: defaultVariant export
- Variant 이미지: 프로퍼티별 각 variant 노드 export

---

## Plugin UI 규칙 (ui.html)

### 크기
- 플러그인 창: **320×480px**

### UI 스타일 컨벤션
- 폰트: `'Inter', -apple-system, sans-serif`, 기본 12px
- 버튼: width 100%, padding 10px, border-radius 8px, font-weight 600
- Primary 버튼: 배경 `#111122`, 텍스트 white
- Publish 버튼: 배경 white, border `1.5px solid #111122`
- Disabled: 배경 `#ccc` 또는 border `#ccc`
- 체크박스 accent: `#111122`
- 프로그레스 바: 배경 `#f8f9fa`, border-radius 6px, 11px 텍스트
- 성공 상태: 배경 `#E6F9EE`, 텍스트 `#03A94D`
- 에러 상태: 배경 `#fff5f5`, 텍스트 `#e53e3e`

### 설정 모달
- 필드 라벨: 10px 대문자, 색상 `#6B4FBB` (보라), letter-spacing 0.5px
- Input: border `1.5px solid #e4e4ee`, focus시 `#6B4FBB`, border-radius 8px
- 저장 버튼: 배경 `#03A94D` (녹색)
- 취소 버튼: 배경 `#F0F0F5`
- 구분선: `#eee` 1px

### 설정 저장
- `figma.clientStorage`에 영구 저장 (사용자별)
- 키: `"confluenceSettings"`
- 필드: serverUrl, confluenceBaseUrl, spaceKey, parentPageId, confluenceUser, confluenceToken

---

## 메시지 프로토콜 (code.js ↔ ui.html)

### UI → Plugin (pluginMessage)
| type | 설명 | payload |
|---|---|---|
| `generate` | 가이드 페이지 생성 | `options: { includeMeasurement, includeExample }` |
| `publish` | Confluence 발행 시작 | — |
| `load-settings` | 설정 로드 요청 | — |
| `save-settings` | 설정 저장 | `settings: { ... }` |

### Plugin → UI (postMessage)
| type | 설명 | payload |
|---|---|---|
| `selection` | 선택 변경 알림 | `component: { id, name, variantCount, propCount } \| null` |
| `progress` | 진행 상태 | `text: string` |
| `done` | 생성 완료 | — |
| `error` | 에러 발생 | `text: string` |
| `settings-loaded` | 저장된 설정 반환 | `settings: { ... }` |
| `settings-saved` | 설정 저장 완료 | — |
| `publish-data` | export 데이터 전달 (UI가 서버로 전송) | `component: { name, description, slots, properties, anatomyImage }` |

---

## Confluence 발행 흐름

1. 플러그인에서 `publish` 메시지 → `analyzeComponent()` + `exportComponentImages()`
2. base64 이미지 포함 데이터를 UI로 전달 (`publish-data`)
3. UI가 Wiki Server (`/api/plugin/publish`)로 POST 전송
4. 서버가 HTML 생성 (`generatePluginHtml`) → Confluence REST API로 발행
5. 동일 제목 페이지 존재 시 업데이트, 없으면 새로 생성

### Confluence HTML 스타일 (서버 생성)
- Pretendard Variable 폰트 사용 (`@import` CDN)
- 인라인 스타일 (Confluence Storage Format 호환)
- max-width: **1400px**, padding: **100px 80px**
- 이미지는 base64 data URI로 직접 삽입
- `<ac:structured-macro ac:name="html">` 래핑
