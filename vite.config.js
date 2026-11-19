import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api/iot-readings': {
        target: 'https://iotwebserver.in',
        changeOrigin: true,
        rewrite: () => '/table.php?id=sedj7xyj',
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Higher-priority groups are assigned before the general frontend
          // group. Add new modules to the matching layer directory.
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-charts',
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 20,
            },
            {
              name: 'hardware',
              test: /[\\/]src[\\/](hardware|device|sensors)[\\/]/,
              priority: 30,
            },
            {
              name: 'backend',
              test: /[\\/]src[\\/](backend|api|services)[\\/]/,
              priority: 30,
            },
            {
              name: 'database',
              test: /[\\/]src[\\/](database|db)[\\/]|[\\/]src[\\/]data[\\/](?!simulation\.js$)/,
              priority: 30,
            },
            {
              name: 'simulation',
              test: /[\\/]src[\\/](simulation)[\\/]|[\\/]src[\\/]data[\\/]simulation\.js$|[\\/]src[\\/]components[\\/]SimulationPanel\.jsx$/,
              priority: 30,
            },
            {
              name: 'frontend',
              test: /[\\/]src[\\/](components|context|hooks|pages|utils|App\.jsx|main\.jsx)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
