import "./globals.css";

export const metadata = {
  title: "Marketing Genie — Your AI marketing operator",
  description:
    "An AI marketing operator that finds what to fix, writes your content, and grows your business — you just approve.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
