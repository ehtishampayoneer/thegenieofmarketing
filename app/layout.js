import "./globals.css";

export const metadata = {
  title: "Marketing Genie — Your AI marketing operator",
  description:
    "An AI marketing operator that finds what to fix, writes your content, and grows your business — you just approve.",
};

// Mobile browser chrome (the status/address bar) is the one surface CSS can't
// reach, so it's set here — Apple's systemGray6 in light, true black in dark —
// otherwise the notch area stays white above a black app and the illusion breaks.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* No webfont. The UI runs on the platform's own system face (SF Pro on
            Apple hardware), so type paints on first frame with no network request,
            no FOUT, and no layout shift — the way Apple's own pages behave. */}
      </head>
      <body className="font-sans antialiased">
        {/* Set the saved theme before first paint so Night users never see a
            flash of Day. The in-app toggle keeps <html data-theme> in sync. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('mg-theme')==='night')document.documentElement.setAttribute('data-theme','night');}catch(e){}" }} />
        {children}
      </body>
    </html>
  );
}
