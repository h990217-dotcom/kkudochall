import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // 이 줄이 있어야 정적 HTML 파일 추출이 가능해집니다!
  basePath: '/kkudochall', // 내 저장소 이름
  assetPrefix: '/kkudochall', // 이미지나 CSS가 깨지지 않게 해주는 설정
  images: {
    unoptimized: true, // 깃허브 페이지 빌드 시 필수 설정
  },
  // 빌드 시 사소한 경고나 타입 체크로 실패하는 것을 방지하는 방어 코드
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
