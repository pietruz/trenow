FROM php:8.3-fpm

RUN apt-get update && apt-get install -y libcurl4-openssl-dev pkg-config \
    && docker-php-ext-install pdo pdo_mysql curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
