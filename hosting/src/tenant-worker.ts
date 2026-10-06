export { KilnTenant } from './tenant';

// Tenant operations are available only through the private Durable Object binding.
export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
