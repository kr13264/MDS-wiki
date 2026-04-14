# MDS CompDocs — Figma Plugin

디자이너용 플러그인. 컴포넌트 세트 → 피그마 가이드 페이지 생성 → Confluence 위키 발행.

## 워크플로우

```
1단계: 컴포넌트 세트 선택 → "가이드 페이지 생성"
       → 피그마에 상세 가이드 페이지 자동 생성

2단계: 가이드 페이지 프레임 선택 → "Confluence 발행"
       → 이미지 export + 위키 페이지 생성/업데이트
```

## 설치

1. Figma → Plugins → Development → Import plugin from manifest
2. `figma-plugin/manifest.json` 선택
3. 플러그인 설정(톱니바퀴)에서 입력:
   - Server URL (`http://localhost:3456`)
   - Confluence Base URL
   - Space Key
   - Parent Page ID
   - API Token

## 파일 구조

| 파일 | 설명 |
|------|------|
| `manifest.json` | 플러그인 메타데이터 |
| `code.js` | 컴포넌트 분석, 가이드 페이지 생성, 가이드 프레임 데이터 추출 |
| `ui.html` | 2탭 UI (가이드 생성 / 위키 발행) + 설정 모달 |

## 주요 함수 (code.js)

| 함수 | 역할 |
|------|------|
| `analyzeComponent()` | 컴포넌트 세트 구조 분석 (프로퍼티, 슬롯, 하위 컴포넌트) |
| `extractSlots()` | 기본 variant에서 슬롯 추출 (바운딩 박스 + 마커 위치) |
| `extractSubComponents()` | 중첩된 하위 컴포넌트 세트 탐색 |
| `extractGuideStructured()` | 가이드 프레임에서 텍스트/이미지 구조 추출 (위키 발행용) |
| `exportNodeImage()` | 노드를 PNG base64로 export (scale 2x) |

## 서버 연동

- `POST /api/plugin/publish` — Confluence 위키 발행
- 서버 실행: `node server/index.mjs`
