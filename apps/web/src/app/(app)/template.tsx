/**
 * Every page in the app mounts inside this, keyed per route, so navigating
 * re-runs the entry: the page's sections rise into place one beat apart (see
 * `.app-page` in app-theme.css). Plain CSS rather than a motion component, so
 * it costs nothing on the server render and nothing after it has played.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="app-page">{children}</div>
}
