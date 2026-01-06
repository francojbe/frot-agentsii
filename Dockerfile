FROM node:20-alpine

WORKDIR /app

# Copiar dependencias
COPY package*.json ./
RUN npm install

# Copiar código fuente
COPY . .

# Construir para producción (opcional si usas 'vite preview', pero recomendado)
RUN npm run build

# Exponer el puerto
EXPOSE 80

# Comando de inicio
CMD ["npm", "run", "start"]
