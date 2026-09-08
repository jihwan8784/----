import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PasswordGate } from "@/components/PasswordGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VRM 아바타 캡처 스튜디오",
  description:
    "웹캠으로 스켈레톤을 인식해 전신·얼굴 아바타를 실시간으로 씌우는 브라우저 스튜디오. 영상은 기기 밖으로 나가지 않습니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#07080f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <PasswordGate>{children}</PasswordGate>
      </body>
    </html>
  );
}
