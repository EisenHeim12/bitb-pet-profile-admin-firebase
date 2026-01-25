import "./globals.css";

export const metadata = {
  title: "BitB Pet Profile Admin",
  description: "Internal salon dashboard for pet profiles (admin-only)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
