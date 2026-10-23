# Schedule HK

한국 병원 및 메디컬뷰티 업체에서 사용할 예약·스케줄 관리 웹사이트를 만들어줘.

프로젝트 이름은 Beauty Schedule Manager야.

아하소프트처럼 월간·주간·일간 예약 캘린더를 제공하면서, 직원별로 예약과 스케줄 열람 권한을 세밀하게 관리하는 시스템이야.

디자인은 화이트 배경에 네이비 포인트를 사용하고, 한국어로 제작해줘. PC와 모바일에서 모두 편리하게 사용하도록 해줘.

사용자 역할은 3가지야.

최고 관리자

모든 직원의 예약과 스케줄 열람 가능

모든 예약 수정·취소 가능

직원 계정 및 권한 관리 가능

내부 직원

본인이 등록한 예약 열람·수정·취소 가능

관리자가 허용한 다른 직원 예약만 열람 가능

외부 직원

본인 예약 등록 가능

본인 예약 열람 가능

본인 예약 수정 가능

본인 예약 취소 가능

다른 직원이 등록한 예약은 절대 볼 수 없음

일반 스케줄은 작성자가 전체 공개, 지정 직원 공개, 비공개 중 선택할 수 있게 만들어줘. 관리자는 모든 일정을 열람할 수 있어야 해.

예약이 취소되면 삭제하지 않고 취소 상태와 변경 이력을 남겨줘.

예약 중복 방지와 관리자용 전체 예약 조회 화면도 만들어줘.

로그인과 데이터베이스는 Supabase 기반으로 구현하고 RLS를 적용해 역할별 데이터 접근을 서버에서 통제해줘.

실제 고객 데이터 대신 가상 데이터만 사용해줘.

먼저 로그인 화면, 관리자 대시보드, 주간·월간 캘린더, 예약 등록 화면, 내 예약 화면, 직원 권한 설정 화면을 구현해줘. 이후 데이터베이스 보안 정책과 접근 권한을 테스트해줘.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://schedule-hk.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ab587084-0119-454b-9aaf-ff855c909948).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
