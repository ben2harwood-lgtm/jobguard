import { afterEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../../lib/identity-server',()=>({identityCredentials:async()=>({sessionToken:'real',csrfToken:'csrf'}),identityApplication:()=>({allowedOrigin:'http://127.0.0.1:3000'})}));
vi.mock('../../../lib/subscription-server',()=>({subscriptionApplication:()=>({read:state.read})}));
import { GET } from './route';
afterEach(()=>vi.clearAllMocks());
it('reads with the real session and the configured origin when the browser sends none',async()=>{state.read.mockResolvedValue({version:'subscription-persisted-read.v1'});const response=await GET(new Request('https://fictional.invalid'));expect(response.status).toBe(200);expect(state.read).toHaveBeenCalledWith({sessionToken:'real',csrfToken:'csrf',origin:'http://127.0.0.1:3000'});});
it('unknown failures are a stable 503',async()=>{state.read.mockRejectedValue(new Error('detail'));const response=await GET(new Request('https://fictional.invalid'));expect(response.status).toBe(503);expect(await response.json()).toEqual({version:'subscription-error.v1',code:'SUBSCRIPTION_UNAVAILABLE'});});
