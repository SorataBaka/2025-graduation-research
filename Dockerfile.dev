# Use the official linuxserver/openssh-server image as the base
FROM linuxserver/openssh-server

# Set environment variables for user and password
ENV PUID=1000
ENV PGID=1000
ENV TZ="Asia/Tokyo"
ENV SSH_PASSWORD="yourpassword"

# Set the working directory
WORKDIR /config

# Expose the SSH port (default is 22)
EXPOSE 22

# Run the OpenSSH server
CMD ["/usr/bin/entrypoint.sh"]

