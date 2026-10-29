import { defineEventHandler, sendRedirect } from 'h3'
import { previewLoginEnabled } from '../lib/preview-login'

// Preview deployments open on the staff login with its one-tap role buttons.
// Only the bare "/" redirects: "/?table=N" still reaches the guest landing.
export default defineEventHandler((event) => {
  if (event.path === '/' && previewLoginEnabled()) return sendRedirect(event, '/staff/login', 302)
})
