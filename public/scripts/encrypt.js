const { subtle } = globalThis.crypto;
let file = null;
let password = "";
console.log("encrypt.js loaded on download.ejs");
console.log(window.location.href);

//ENCRYPT
async function aesEncrypt(file, password) {
  const file_name = file.name + "|SEPERATOR|";
  const passwordAsBytes = new TextEncoder().encode(password);
  const fileNameInBytes = new TextEncoder().encode(file_name);
  const fileBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const passwordCryptoKey = await subtle.importKey(
    "raw",
    passwordAsBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const salt = window.crypto.getRandomValues(new Uint8Array(16));

  const cryptoKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordCryptoKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );

  /*
  const key = await subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );*/
  const encryptedData = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    cryptoKey,
    fileBuffer
  );
  //const encryptionKey = (await subtle.exportKey("jwk", cryptoKey)).k;
  return { encryptedData, iv, salt, fileNameInBytes };
}

//DECRYPT
async function aesDecrypt(fileObj, password) {
  const passwordAsBytes = new TextEncoder().encode(password);
  const salt = new Uint8Array(fileObj.salt);
  const passwordCryptoKey = await subtle.importKey(
    "raw",
    passwordAsBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const deriveCryptoKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordCryptoKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["decrypt"]
  );

  /*const key = await subtle.importKey(
    "jwk",
    {
      kty: "oct",
      k: fileObj.encryptionKey,
      alg: "A256GCM",
      ext: true,
    },
    {
      name: "AES-GCM",
    },
    true,
    ["decrypt"]
  );*/
  const decryptedBuffer = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(fileObj.iv),
    },
    deriveCryptoKey,
    new Uint8Array(fileObj.encryptedData)
  );
  return decryptedBuffer;
}

const fileInput = document.getElementById("file");
const encryptBtn = document.getElementById("encrypt");

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    if (!e.target) return;
    file = e.target.files[0];
  });
}

if (encryptBtn) {
  encryptBtn.addEventListener("click", async () => {
    const passwordInput = document.getElementById("password");
    const password = passwordInput.value.trim();
    if (!password) {
      passwordInput.style.borderColor = "red";
      alert("Password required");
      return;
    }
    //SET EXPIRATION TIME
    const expirationDate = new Date(Date.now() + 1 * 60 * 1000);
    const expirationDateBytes = new TextEncoder().encode(
      expirationDate.toISOString()
    );
    const { encryptedData, iv, salt, fileNameInBytes } = await aesEncrypt(
      file,
      password
    );
    const blob = new Blob(
      [
        expirationDateBytes,
        salt,
        iv,
        fileNameInBytes,
        new Uint8Array(encryptedData),
      ],
      {
        type: "application/octet-stream",
      }
    );
    const formData = new FormData();
    formData.append("file", blob, file.name + ".enc");
    const response = await (await sendData(formData)).text();
    file_link_url = response;
    document.getElementById("share_section").innerHTML = /*html*/ `
      <p>Share this link:</p>
      <a id="link" href="${file_link_url}" readonly style="width: 300px;">${file_link_url}</a>
      <button onclick="navigator.clipboard.writeText('${file_link_url}')">Copy</button>
      <a href="/">
        <button type="button">Make another link</button>
      </a>
    `;
    document.getElementById("file").value = "";
    document.getElementById("password").value = "";

    /*document.getElementById("link").addEventListener("click", async (e) => {
      const text = e.target.textContent;
      const url = text.substring(0, text.indexOf("#"));
      const encryptionKey = text.substring(text.indexOf("#") + 1);
      const response = await fetch(url);
      const file_json = await response.json();
      const file_data = {
        iv: new Uint8Array(
          Array.from(atob(file_json.iv), (c) => c.charCodeAt(0))
        ),
        encryptedData: new Uint8Array(
          Array.from(atob(file_json.encryptedData), (c) => c.charCodeAt(0))
        ),
        encryptionKey: encryptionKey,
      };
      console.log(file_data);
      const decryptedBuffer = await aesDecrypt(file_data);
      const note = new TextDecoder().decode(decryptedBuffer);
      console.log(note);
    });*/
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const hash = window.location.hash;
  const path = window.location.pathname;
  console.log(window.location.href);

  if (path.includes("/download")) {
    const fileId = path.split("/download/")[1];
    console.log(fileId);
    //const encryptionKey = hash.substring(1);

    try {
      const response = await fetch(`/file/${fileId}`);
      if (!response.ok) {
        console.log("expired");
        window.location.href = "/expired";
        throw new Error("File expired");
      }
      const file_json = await response.json();
      const fileName = file_json.fileName;
      const file_data = {
        salt: new Uint8Array(
          Array.from(atob(file_json.salt), (c) => c.charCodeAt(0))
        ),
        iv: new Uint8Array(
          Array.from(atob(file_json.iv), (c) => c.charCodeAt(0))
        ),
        encryptedData: new Uint8Array(
          Array.from(atob(file_json.encryptedData), (c) => c.charCodeAt(0))
        ),
      };

      document
        .getElementById("downloadBtn")
        .addEventListener("click", async () => {
          //CORRECT PASSWORD
          try {
            const response = await fetch(`/file/${fileId}`);
            if (!response.ok) {
              console.log("expired");
              window.location.href = "/expired";
              throw new Error("File expired");
            }
            const password = document.getElementById("password");
            const decryptedBuffer = await aesDecrypt(file_data, password.value);
            const blob = new Blob([decryptedBuffer], {
              type: "application/octet-stream",
            });
            const blobUrl = URL.createObjectURL(blob);

            //SUCCESS MESSAGE
            const x = document.getElementById("password_status");
            const img = document.getElementById("wrongPswImg");
            x.textContent = "Success";
            x.style.color = "green";
            password.style.borderColor = "green";
            img.src = "";
            img.alt = "";
            img.style = "width:0px;height:0px;";
            console.log("nice");

            //CREATING A DOWNLOAD LINK
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            //FREE MEMORY
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            //WRONG PASSWORD
            const password = document.getElementById("password");
            const x = document.getElementById("password_status");
            const img = document.getElementById("wrongPswImg");
            x.textContent = "Wrong!";
            x.style.color = "red";
            password.style.borderColor = "red";
            img.src = "/images/wrongPassword.jpg";
            img.alt = "Wrong Password image";
            img.style = "width:256px;height:256px;";
            console.log("wrong password");
            console.log("File expired");
          }
        });
    } catch (error) {
      console.log(error);
    }
  }
});

//TOGGLE PASSWORD VISIBILITY
function myFunction() {
  var x = document.getElementById("password");
  if (x.type === "password") {
    x.type = "text";
  } else {
    x.type = "password";
  }
}

//SEND ENCRYPTED DATA TO THE SERVER
async function sendData(formData) {
  const response = await fetch("/upload", {
    method: "POST",
    body: formData,
  });
  return response;
}
