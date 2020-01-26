#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm
#RUN git clone https://github.com/DuoSoftware/DVP-CDREventListner.git /usr/local/src/cdreventlistner
#RUN cd /usr/local/src/cdreventlistner; npm install
#CMD ["nodejs", "/usr/local/src/cdreventlistner/app.js"]

#EXPOSE 8816

# FROM node:9.9.0
# ARG VERSION_TAG
# RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-CDREventListner.git /usr/local/src/cdreventlistner
# RUN cd /usr/local/src/cdreventlistner;
# WORKDIR /usr/local/src/cdreventlistner
# RUN npm install
# EXPOSE 8816
# CMD [ "node", "/usr/local/src/cdreventlistner/app.js" ]

FROM node:10-alpine
WORKDIR /usr/local/src/cdreventlistner
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8816
CMD [ "node", "app.js" ]
