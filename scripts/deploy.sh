#!/bin/bash

# Payment Security Enhancement API Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE=".env.production"
fi

echo -e "${GREEN}Starting deployment for ${ENVIRONMENT} environment...${NC}"

# Check if required files exist
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: Environment file $ENV_FILE not found${NC}"
    echo "Please copy .env.example to $ENV_FILE and configure it"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: Docker compose file $COMPOSE_FILE not found${NC}"
    exit 1
fi

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

# Validate environment variables
echo -e "${YELLOW}Validating environment configuration...${NC}"
source "$ENV_FILE"

if [ -z "$VALID_API_KEYS" ]; then
    echo -e "${RED}Error: VALID_API_KEYS not set in $ENV_FILE${NC}"
    exit 1
fi

if [ "$ENVIRONMENT" = "production" ]; then
    if [ "$NODE_ENV" != "production" ]; then
        echo -e "${RED}Error: NODE_ENV must be 'production' for production deployment${NC}"
        exit 1
    fi
    
    if [ "$HTTPS_ONLY" != "true" ]; then
        echo -e "${YELLOW}Warning: HTTPS_ONLY is not enabled for production${NC}"
    fi
    
    # Check SSL certificates
    if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
        echo -e "${RED}Error: SSL certificates not found in ssl/ directory${NC}"
        echo "Please provide cert.pem and key.pem for HTTPS"
        exit 1
    fi
fi

# Create necessary directories
echo -e "${YELLOW}Creating necessary directories...${NC}"
mkdir -p logs/nginx
mkdir -p ssl

# Build and deploy
echo -e "${YELLOW}Building and starting services...${NC}"

# Stop existing services
docker-compose -f "$COMPOSE_FILE" down

# Build images
docker-compose -f "$COMPOSE_FILE" build --no-cache

# Start services
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 30

# Health checks
echo -e "${YELLOW}Running health checks...${NC}"

# Check API health
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✓ API health check passed${NC}"
else
    echo -e "${RED}✗ API health check failed${NC}"
    echo "Checking logs..."
    docker-compose -f "$COMPOSE_FILE" logs payment-api
    exit 1
fi

# Check Redis
if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✓ Redis health check passed${NC}"
else
    echo -e "${RED}✗ Redis health check failed${NC}"
    exit 1
fi

# Check Nginx (if in production)
if [ "$ENVIRONMENT" = "production" ]; then
    if curl -f -s -k https://localhost/health > /dev/null; then
        echo -e "${GREEN}✓ Nginx health check passed${NC}"
    else
        echo -e "${RED}✗ Nginx health check failed${NC}"
        docker-compose -f "$COMPOSE_FILE" logs nginx
        exit 1
    fi
fi

# Display service status
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${YELLOW}Service Status:${NC}"
docker-compose -f "$COMPOSE_FILE" ps

# Display useful information
echo -e "${YELLOW}Useful Commands:${NC}"
echo "View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "Stop services: docker-compose -f $COMPOSE_FILE down"
echo "Restart services: docker-compose -f $COMPOSE_FILE restart"

if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}Production URLs:${NC}"
    echo "API: https://localhost/api/simulate-payment"
    echo "Health: https://localhost/health"
    echo "Status: https://localhost/api/status"
else
    echo -e "${YELLOW}Development URLs:${NC}"
    echo "API: http://localhost:3000/api/simulate-payment"
    echo "Health: http://localhost:3000/health"
    echo "Status: http://localhost:3000/api/status"
fi

echo -e "${GREEN}Deployment completed successfully!${NC}"