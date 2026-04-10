# MDS Wiki Generator

MDS 디자인 시스템 컴포넌트 가이드를 Confluence 위키용 HTML로 자동 생성합니다.

## 두 가지 워크플로우

### 1. 웹 에디터 방식
Figma에서 컴포넌트 데이터를 추출 → 웹 에디터(`localhost:3456`)에서 편집/확인 → Confluence 발행

- API 경로: `/api/web/...`
- 관련 파일: `public/` (프론트엔드), `server/index.mjs` (서버)

### 2. Figma 플러그인 방식
Figma에서 직접 가이드 페이지 생성 → 플러그인에서 바로 Confluence 발행

- API 경로: `/api/plugin/...`
- 관련 파일: `figma-plugin/` (플러그인), `server/index.mjs` (서버)

## 디렉토리 구조

```
mds-wiki/
├── figma-plugin/      ← Figma 플러그인 (가이드 생성 + 위키 발행)
│   ├── manifest.json
│   ├── code.js
│   └── ui.html
├── server/
│   └── index.mjs      ← 공용 서버 (웹 에디터 + 플러그인 API)
├── public/            ← 웹 에디터 (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── components/        ← 컴포넌트별 JSON 데이터 (웹 에디터용)
├── scripts/
│   ├── generate.mjs   ← JSON → Confluence HTML 변환
│   └── preview.mjs    ← 로컬 브라우저 미리보기
└── output/            ← 생성된 HTML 파일
```

## 실행

```bash
node server/index.mjs
# → http://localhost:3456 에서 웹 에디터 + 플러그인 서버 동시 실행
```

## Figma 플러그인 설치 (팀원용)

1. 이 레포를 클론
2. `node server/index.mjs`로 서버 실행
3. Figma → Plugins → Development → Import plugin from manifest → `figma-plugin/manifest.json` 선택
4. 플러그인 설정(톱니바퀴)에서 Server URL, Confluence 정보, API Token 입력

## 주요 기능

### Figma에서 자동 추출

Figma URL을 입력하면 아래 정보가 자동으로 추출됩니다:

- **컴포넌트명 / 설명**: Figma description이 없으면 컴포넌트 유형에 맞는 설명이 자동 생성됩니다.
- **프로퍼티 (VARIANT)**: 각 프로퍼티의 값 목록과 기본값, 프로퍼티별 설명이 자동 생성됩니다.
- **슬롯 (BOOLEAN/SLOT)**: 슬롯 이름에 맞는 설명이 자동 생성됩니다.
- **Anatomy**: 기본 변형(default variant) 스크린샷 + 슬롯 바운딩 박스 위치
- **Example**: 무작위 변형 조합 5개가 자동 선택되어 예시 섹션으로 생성됩니다.

### 이미지 처리 (크기 + 해상도)

모든 이미지(Anatomy, 프로퍼티 변형, Example)에 동일한 로직이 적용됩니다:

1. **Figma API에서 `scale=2`로 내보내기** → 2배 해상도 PNG 확보 (레티나 선명도용)
2. **Figma `absoluteBoundingBox`에서 원본 width/height 읽기** → 컴포넌트의 실제 디자인 크기
3. **`<img>` 태그에 원본 크기를 `width`/`height` 속성으로 적용** → 2x 이미지를 1x 크기로 표시

```
Figma 컴포넌트 (30×30px) → scale=2 내보내기 (60×60px PNG) → width="30" height="30" (30×30px로 표시)
                                                              → 레티나(2x) 디스플레이에서 픽셀 1:1 매칭 = 선명
```

#### 신규 데이터 (Figma에서 새로 가져온 경우)
- 서버가 `absoluteBoundingBox.width` / `height`를 각 variant에 저장
- JSON: `variantImages: [{ label, imageUrl, width, height }]`
- 렌더링: `<img src="..." width="${vi.width}" height="${vi.height}" />`

#### 기존 데이터 (width/height 없는 경우, 호환용)
- `onload="this.width=this.naturalWidth/2;this.height=this.naturalHeight/2;"` 로 fallback
- scale=2 이미지의 픽셀 크기 ÷ 2 = 원본 1x 크기로 자동 복원
- **해결 방법**: Figma에서 다시 가져오기하면 width/height 데이터가 포함됨

#### CSS
- `.variant-item img { max-height: 120px; }` → 큰 컴포넌트(Thumbnail 등)는 120px로 제한
- 작은 컴포넌트(Button 30~44px 등)는 원본 크기 그대로 표시

### 설명 자동 생성

Figma에서 설명이 비어있을 경우 아래와 같이 자동 생성됩니다:

| 대상 | 예시 |
|------|------|
| 컴포넌트 설명 | `button` → "다양한 액션을 실행하기 위한 버튼 컴포넌트입니다." |
| 프로퍼티 설명 | `Size` → "{컴포넌트}의 크기를 설정합니다." |
| 프로퍼티 설명 | `State` → "{컴포넌트}의 상태를 나타냅니다." |
| 슬롯 설명 | `icon` → "컴포넌트에 포함되는 아이콘 요소입니다." |
| 슬롯 설명 | `label` → "컴포넌트에 표시되는 텍스트 레이블입니다." |

40+ 컴포넌트 유형, 30+ 프로퍼티 유형, 20+ 슬롯 유형이 사전 등록되어 있으며, 매칭되지 않는 경우에도 일반적인 설명이 자동 생성됩니다.

### Anatomy 편집

- 마커(번호): 이미지 밖으로 나갈 수 있음 (패딩 50px 영역 활용)
- 가이드(박스): 이미지 내부에만 배치
- 편집 모드에서 드래그로 위치 조정, 미리보기에서 동일하게 렌더링

### Confluence 발행

미리보기 탭에서 HTML을 복사하거나, Confluence API를 통해 직접 발행할 수 있습니다.

## 사용법

### 1. 컴포넌트 데이터 작성

`components/` 폴더에 JSON 파일을 추가합니다:

```json
{
  "name": "Button",
  "description": "다양한 액션을 실행하기 위한 버튼 컴포넌트입니다.",
  "figmaUrl": "https://www.figma.com/design/...",
  "anatomy": {
    "imageUrl": "",
    "imageWidth": 200,
    "imageHeight": 44,
    "figmaNodeId": "1234:5678",
    "slots": [
      { "number": 1, "name": "label", "description": "컴포넌트에 표시되는 텍스트 레이블입니다.", "value": "String" }
    ]
  },
  "properties": [
    {
      "title": "Size",
      "description": "Button의 크기를 설정합니다.",
      "figmaNodeId": "1234:5679",
      "imageUrl": "",
      "values": [
        { "label": "Large", "isDefault": true },
        { "label": "Medium" },
        { "label": "Small" }
      ],
      "variantImages": [
        { "label": "Large", "imageUrl": "/uploads/...", "width": 200, "height": 44 }
      ]
    }
  ]
}
```

### 2. HTML 생성 (CLI)

```bash
# 전체 컴포넌트
node scripts/generate.mjs

# 특정 컴포넌트만
node scripts/generate.mjs thumbnail

# 등록된 컴포넌트 목록
node scripts/generate.mjs --list
```

### 3. 미리보기

```bash
node scripts/preview.mjs thumbnail
# → 브라우저에서 자동으로 열림
```
