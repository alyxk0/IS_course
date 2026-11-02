FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS server
WORKDIR /app
COPY --from=client /app/backend ./backend
COPY --from=client /app/dist ./dist
RUN mvn -f backend/pom.xml -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=server /app/backend/target/sheets-1.0.0.jar ./sheets.jar
ENV PORT=8081 BIND_ADDRESS=0.0.0.0
USER 10001:10001
EXPOSE 8081
CMD ["java", "-Xmx768m", "-jar", "sheets.jar"]
