import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getBackendConfig } from "@/lib/backendClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SecuriGit",
  description: "Security posture across a GitHub organization",
};

async function currentOrg(): Promise<string | null> {
  try {
    return (await getBackendConfig()).org;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('securigit-theme');if(t==='dark'||t==='hacker'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
        <Nav org={await currentOrg()} />
        <main className="min-h-screen pb-16 pt-[62px] lg:pb-0 lg:pl-[208px]">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6">{children}</div>
        </main>
      </body>
    </html>
  );
}
