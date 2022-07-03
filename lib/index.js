const TonWeb = require('tonweb')
const toNano = TonWeb.utils.toNano;
if (!window.location.search) {
  $(document).ready(async function () {
    var walletConnect = document.getElementById("connect");
    walletConnect.addEventListener("click", async function () {
      const apiKey = 'df344c315ae71a22ae1e58ceb3158597e78435c7dac009bf30e619e3c6dca9fa'
      const tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC', {apiKey: apiKey}));
      const provider = window.ton;  
      let account
      if (localStorage.getItem("userTonWalletAddress")) {
        account = localStorage.getItem("userTonWalletAddress")
      } else {
        const accounts = await provider.send('ton_requestAccounts');
        account = accounts[0];
        localStorage.setItem("userTonWalletAddress", account)
      }
      walletConnect.textContent = account.slice(0, 6) + '...' + account.slice(account.length - 4, account.length);
      const wallet = tonweb.wallet.create({address: account});
      const address = await wallet.getAddress();
      const balanceA = await tonweb.getBalance(address);
      const storagePublicKey = localStorage.getItem('publicKey')
      const storagePrivateKey = localStorage.getItem('secretKey')
      const storageWalletAddress = localStorage.getItem('walletAddress')
      if (!storagePublicKey || !storagePrivateKey || !storageWalletAddress) {
        const pair = TonWeb.utils.nacl.sign.keyPair();
        const pubkey = TonWeb.utils.bytesToHex(pair.publicKey);
        const privkey = TonWeb.utils.bytesToHex(pair.secretKey);
        localStorage.setItem("publicKey", pubkey);
        localStorage.setItem("secretKey", privkey);
        const wallet = tonweb.wallet.create({publicKey: pair.publicKey});
        const walletAddress = await wallet.getAddress();
        localStorage.setItem("walletAddress", walletAddress.toString(true, true, true));
      }
      const internalWallet = tonweb.wallet.create({address: localStorage.getItem("walletAddress")});
      const internalAddress = await internalWallet.getAddress();
      const internalBalance = await tonweb.getBalance(internalAddress);
      const internalNumBalance = internalBalance / 10**9
      document.getElementById("walletHeader").style.display = "none"
      if (internalNumBalance > 0) {
        const text = "Your in-game balance: " + internalNumBalance.toString() + " TON"
        document.getElementById("startInternalBalance").style.display = 'inline-block'  
        document.getElementById("startInternalBalance").innerText = text  
        document.getElementById("room").style.display = "flex"
        document.getElementById("name").disabled = false;
        document.getElementById("inputName").disabled = false;
        document.getElementById("createGame").disabled = false;
        document.getElementById("connect").disabled = true;
        document.getElementById("withdrawInput").style.display = "inline-block"
        document.getElementById("withdraw").style.display = "inline-block"
      }
      const withdrawButton = document.getElementById("withdraw")
      withdrawButton.addEventListener("click", async function() {
        try {
          const base64Key = localStorage.getItem("secretKey")
          const internalBalanceBefore = await tonweb.getBalance(internalAddress);
          const bytesArray = TonWeb.utils.hexToBytes(base64Key)
          const internalWallet = tonweb.wallet.create({address: localStorage.getItem("walletAddress")})
          const seqno = await internalWallet.methods.seqno().call()
          const amount = document.getElementById("withdrawInput").value
          const transfer = internalWallet.methods.transfer({
            secretKey: bytesArray,
            toAddress: localStorage.getItem("userTonWalletAddress"),
            amount: TonWeb.utils.toNano(amount.toString()),
            seqno: seqno,
            payload: 'Withdraw',
            sendMode: 3,
          });
          const transferSended = await transfer.send();
          document.getElementById("withdraw").style.display = "none";
          document.getElementById("withdrawLoad").style.display = "inline-block";
          if (transferSended) {
            let wait = async function () {
              const internalBalanceNow = await tonweb.getBalance(internalAddress);
              console.log(internalBalanceBefore, internalBalanceNow)
              if (internalBalanceBefore !== internalBalanceNow) {
                const balanceA = await tonweb.getBalance(address);
                const text = 'Your balance: ' + (balanceA / 10**9).toString() + ' TON'
                document.getElementById("startTonBalance").innerText = text
                const textBalance = "Your in-game balance: " + (internalBalanceNow/10**9).toString() + " TON"
                const internalBalance = document.getElementById("startInternalBalance")
                internalBalance.innerText = textBalance
                document.getElementById("withdrawLoad").style.display = "none";
                document.getElementById("withdraw").style.display = "inline-block"    
                clearInterval(intervalId);
              }
            }
            intervalId = setInterval(wait, 5000);
          } else {
            document.getElementById("withdrawLoad").style.display = "none";
            document.getElementById("withdraw").style.display = "inline-block"
          }
        } catch(err) {
          console.log(err)
        }
      })
      const base64Key = localStorage.getItem("secretKey")
      const bytesArray = TonWeb.utils.hexToBytes(base64Key)
      const seqno = await internalWallet.methods.seqno().call()
      let deploy
      let sumOfFees = 0
      if (!seqno) {
        deploy = wallet.deploy(bytesArray);
        const fee = await deploy.estimateFee()
        sumOfFees = fee.source_fees.fwd_fee + fee.source_fees.gas_fee + fee.source_fees.in_fwd_fee
        sumOfFees = sumOfFees / 10**9
        console.log(sumOfFees)
        const deployText = "Along with the deposit your in-game wallet will also be deployed. Deploy fee: " + sumOfFees.toString() + " TON (the deployment is required only 1 time)"
        const feeInfo = document.getElementById("feeInfo")
        feeInfo.style.display = "inherit"
        feeInfo.innerText = deployText
      }
      const text = 'Your balance: ' + (balanceA / 10**9).toString() + ' TON'
      document.getElementById("startTonBalance").style.display = 'inline-block'
      document.getElementById("startTonBalance").innerText = text
      document.getElementById("deposit").style.display = "inline-block";
      document.getElementById("depositInput").style.display = "inline"
      document
      .getElementById("deposit")
      .addEventListener("click", async function() {
        try {
          let internalBalanceBefore = await tonweb.getBalance(internalAddress);
          internalBalanceBefore = internalBalanceBefore.toString()
          const wallet = localStorage.getItem('walletAddress')
          const amount = document.getElementById("depositInput").value
          const nanoAmount = toNano(amount).toString()
          const tx = await provider.send(
            'ton_sendTransaction',
            [{
              to: wallet,
              value: nanoAmount,
              data: 'wallet deposit',
              dataType: 'text'
            }]
          );
          document.getElementById("deposit").style.display = "none";
          document.getElementById("depositLoad").style.display = "inline-block";
          document.getElementById("feeInfo").innerText = "Depositing..."
          if (tx) {
            let wait = async function(){
              const internalBalanceNow = await tonweb.getBalance(internalAddress);
              console.log(internalBalanceBefore, internalBalanceNow)
              if(internalBalanceNow === internalBalanceBefore) {
                ///
              } else {

                const balanceA = await tonweb.getBalance(address);
                const text = 'Your balance: ' + (balanceA / 10**9).toString() + ' TON'
                document.getElementById("startTonBalance").innerText = text
                const textBalance = "Your in-game balance: " + (internalBalanceNow/10**9).toString() + " TON"
                const internalBalance = document.getElementById("startInternalBalance")
                internalBalance.style.display = "inherit"
                internalBalance.innerText = textBalance
                clearInterval(intervalId);
                if (deploy) {
                  document.getElementById("feeInfo").innerText = "Deploying..."
                  console.log("deploy")
                  await deploy.send()
                  let waitDeploy = async () => {
                    const seqno = await internalWallet.methods.seqno().call()
                    console.log("seqno:", seqno)
                    if (seqno) {
                      console.log("deployed")
                      clearInterval(deployInterval)
                      document.getElementById("withdrawInput").style.display = "inline-block"
                      document.getElementById("withdraw").style.display = "inline-block"                        
                      document.getElementById("feeInfo").style.display = "none"
                      document.getElementById("depositLoad").style.display = "none";
                      document.getElementById("deposit").style.display = "inline-block"
                      // document.getElementById("depositInput").style.display = "none"  
                      document.getElementById("room").style.display = "flex"
                      document.getElementById("name").disabled = false;
                      document.getElementById("inputName").disabled = false;
                      document.getElementById("createGame").disabled = false;
                      document.getElementById("connect").disabled = true;      
                    }
                  }
                  deployInterval = setInterval(waitDeploy, 5000)
                } else {
                  document.getElementById("withdrawInput").style.display = "inline-block"
                  document.getElementById("withdraw").style.display = "inline-block"                    
                  document.getElementById("feeInfo").style.display = "none"
                  document.getElementById("depositLoad").style.display = "none";
                  document.getElementById("deposit").style.display = "inline-block"
                  // document.getElementById("depositInput").style.display = "none"  
                  document.getElementById("room").style.display = "flex"
                  document.getElementById("name").disabled = false;
                  document.getElementById("inputName").disabled = false;
                  document.getElementById("createGame").disabled = false;
                  document.getElementById("connect").disabled = true;  
                } 
              }
            };
            intervalId = setInterval(wait, 5000);
          } else { 
            document.getElementById("depositLoad").style.display = "none";
            document.getElementById("deposit").style.display = "inline-block"
          }
        } catch (err) {
          console.log(err)
        }
      })
      document
        .getElementById("name")
        .addEventListener("click", async function () {
          const storageWalletAddress = localStorage.getItem("walletAddress")
          const wallet = tonweb.wallet.create({address: storageWalletAddress});
          const address = await wallet.getAddress();
          const balance = await tonweb.getBalance(address);
          const numBalance = balance / 10**9
          if (numBalance >= 1) {
            window.location.search = document.getElementById("inputName").value;
          }
        });
        document
        .getElementById("createGame")
        .addEventListener("click", async function () {
          const storageWalletAddress = localStorage.getItem("walletAddress")
          const wallet = tonweb.wallet.create({address: storageWalletAddress});
          const address = await wallet.getAddress();
          const balance = await tonweb.getBalance(address);
          const numBalance = balance / 10**9
          if (numBalance >= 1) {
            window.location.search =  Math.random().toString(16).slice(-10);
          }
        });
    });
    if (localStorage.getItem("userTonWalletAddress")) {
      $('#connect').trigger('click');
    }
  });
} else {
  const apiKey = 'df344c315ae71a22ae1e58ceb3158597e78435c7dac009bf30e619e3c6dca9fa'
  const tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC', {apiKey: apiKey}));

  $(document).ready(async function () {
    const tonWalletAddress = localStorage.getItem("userTonWalletAddress")
    const tonWallet = tonweb.wallet.create({address: tonWalletAddress});
    const tonAddress = await tonWallet.getAddress();
    const balanceA = await tonweb.getBalance(tonAddress);
    const text = 'Your balance: ' + (balanceA / 10**9).toString() + ' TON'
    const tonBalance = document.getElementById("tonBalance")
    tonBalance.style.display = "inherit"
    tonBalance.innerText = text
    const storageWalletAddress = localStorage.getItem("walletAddress")
    const wallet = tonweb.wallet.create({address: storageWalletAddress});
    const address = await wallet.getAddress();
    const balance = await tonweb.getBalance(address);
    const numBalance = balance / 10**9
    const textBalance = "Your wallet balance: " + numBalance.toString() + " TON"
    const textWallet = "Your in-game wallet: " + storageWalletAddress

    const internalBalance = document.getElementById("internalBalance")
    internalBalance.style.display = "inherit"
    internalBalance.innerText = textBalance
    const internalWallet = document.getElementById("internalWallet")
    internalWallet.style.display = "inherit"
    internalWallet.innerText = textWallet

    document.getElementById("start").style.display = "none"; // hide
    document.getElementById("info").style.display = "inline";
    document.getElementById("finishGame").style.display = "inline-block";
    document.getElementById("canvas").style.display = "inherit";

    document.getElementById("finishGame").addEventListener("click", async function () {
      this.innerText = 'Finishing...';
      await window.gameRoom.finishGame();
      window.location.search = "";
    });
  });
}

var roomName = window.location.search;
