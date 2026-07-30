import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/client', '/coach', '/admin', '/login', '/register', '/reset-password', '/soon'],
    },
    sitemap: 'https://thelabpilatesstudio.com.mx/sitemap.xml',
  }
}
