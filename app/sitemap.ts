// app/sitemap.ts
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://clausecheckai.vercel.app',
      lastModified: new Date(),
    },
    {
      url: 'https://clausecheckai.vercel.app/analyze', // 분석 페이지 있으면 추가
      lastModified: new Date(),
    },
  ]
}