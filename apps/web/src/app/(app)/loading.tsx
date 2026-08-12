import { Loader } from '@/components/app/loader'

/**
 * The wait between authenticated screens.
 *
 * One file covers every route in the group, because the shell — sidebar, top
 * bar, tab bar — is already on screen and stays there; only the content area
 * swaps. Centring the loader in that area rather than the viewport is what
 * keeps the chrome from appearing to jump.
 */
export default function AppLoading() {
  return (
    <div className="app-container">
      <Loader />
    </div>
  )
}
