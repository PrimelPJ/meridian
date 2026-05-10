.PHONY: build start dev test docker-build docker-up

build:
	npm run build

start: build
	npm run start

dev:
	npm run dev

test:
	npm test

docker-build:
	docker build -t meridian:latest .

docker-up:
	docker-compose up -d

install:
	npm install
