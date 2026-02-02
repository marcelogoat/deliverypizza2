# Railway Deployment - Pizza Delivery

## Deploy Instructions

### 1. Fazer Push para GitHub

```bash
git add .
git commit -m "Setup for Railway deployment"
git push -u origin main
```

### 2. Criar Projeto no Railway

1. Acesse: https://railway.app
2. Clique em "Start a New Project"
3. Escolha "Deploy from GitHub repo"
4. Selecione: `marceluuuu/deeliverypizza`
5. Railway detectará automaticamente que é um projeto Node.js

### 3. Configurar Variáveis de Ambiente

No Railway, vá em **Variables** e adicione:

```
MARCHAPAY_PUBLIC_KEY=pk_SsBz3tNG97HWkHjSJfgR2oyFofMXW-ZTcyT4OYBrp6BH87y_
MARCHAPAY_SECRET_KEY=sk_BFlaOTkZL0r09eKGF9Ak412YPAnr3a-R0UuQzCoPlxrNKJ6g
UTMIFY_API_TOKEN=Z5FI4LGLYeOvP5Ku6bxT919qolKE2KUsnP7X
PORT=3000
```

### 4. Deploy Automático

Railway fará deploy automaticamente! 🚀

Você receberá uma URL tipo: `https://seu-projeto.railway.app`

### 5. Testar

Acesse: `https://seu-projeto.railway.app/custom_checkout.html`

---

## Estrutura do Projeto

```
Railway serve:
- Backend (server.js) na porta 3000
- Frontend (HTML/CSS/JS) como arquivos estáticos
```

O Railway cuida de tudo automaticamente!
