import type { Scene } from './scenes.ts'
import { guestOrders, joinTable, openCart, tapMenuItem } from './setup.ts'

const GUEST_TABLE = 3

// Table 3 with two items in the cart, bar visible.
async function fillCart(ctx: Parameters<Scene>[0]) {
  const { page } = await ctx.open('guest')
  await joinTable(page, GUEST_TABLE)
  await tapMenuItem(page, /^add fries to cart$/i)
  await tapMenuItem(page, /beer 0\.5 to cart/i)
  return page
}

export const guestMenu: Scene = async (ctx) => {
  const page = await fillCart(ctx)
  await ctx.shoot(page, 'guest-menu')
}

export const guestCart: Scene = async (ctx) => {
  const page = await fillCart(ctx)
  await openCart(page)
  await ctx.shoot(page, 'guest-cart')
}

export const guestStatus: Scene = async (ctx) => {
  const { page } = await ctx.open('guest')
  await guestOrders(page, GUEST_TABLE, [/sausage to cart/i, /cola 0\.33 to cart/i])
  await ctx.shoot(page, 'guest-status')
}
