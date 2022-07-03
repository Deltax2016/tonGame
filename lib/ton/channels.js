// jscs:disable validateIndentation
ig.module(
  'ton.channels'
)
.defines(function() {

    const TonWeb = window.TonWeb;
    const BN = TonWeb.utils.BN;
    const toNano = TonWeb.utils.toNano;
    const DELTA = toNano("0.1")
    const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = 'f6f28cb83ed713758fd55c7af2bcdec80da0a738f4b3f2a82cb4bc615b8fda6f';


    function updateData()
    {
        console.log('datadata1')
        const ingameBalance = "Your in-game balance: " + localStorage.getItem("ingameBalance") + " TON"
        const enemyWallet = "Your enemy in-game balance: " + localStorage.getItem("enemyBalance") + " TON"

        const inBalance = window.document.getElementById("ingameBalance")
        inBalance.style.display = "inherit"
        inBalance.innerText = ingameBalance
        const enBalance = window.document.getElementById("enemyBalance")
        enBalance.style.display = "inherit"
        enBalance.innerText = enemyWallet
    }

    function RNG(seed) {

        this.m = 0x80000000;
        this.a = 1103515245;
        this.c = 12345;

        let k = 0;
        for (let i = 0; i < seed.length; i++) {
            k += seed.charCodeAt(i);
        }

        k+=Math.floor(Date.now() / 10000);

      this.state = k ? k : Math.floor(Math.random() * (this.m - 1));
    }
    RNG.prototype.nextInt = function() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state;
    }
    RNG.prototype.nextRange = function(start, end) {
      var rangeSize = end - start;
      var randomUnder1 = this.nextInt() / this.m;
      return start + Math.floor(randomUnder1 * rangeSize);
    }
    RNG.prototype.choice = function(array) {
      return array[this.nextRange(0, array.length)];
    }

    TONChannel = function(walletAddress, publicKey,isA) {
        this.isA=isA;
        const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, {apiKey}));
        this.connection = window.gameRoom.roomConnection;

        this.secretKey = TonWeb.utils.hexToBytes(localStorage.getItem("secretKey"));

        this.myWallet = tonweb.wallet.create({
            publicKey: TonWeb.utils.hexToBytes(localStorage.getItem("publicKey"))
        });
        // here the wallet address is supposed to already exist and have funds
        this.myWallet.getAddress().then((r) => {
            this.myWalletAddress = r;
            console.log('_______wallet address: ', this.myWalletAddress.toString());

            const theirWallet = tonweb.wallet.create({
                publicKey: TonWeb.utils.hexToBytes(publicKey)
            });

            theirWallet.getAddress().then((r) => {

                this.theirWalletAddress = r;

                this.channelInitState = {
                    balanceA: toNano('0.5'), // A's initial balance in Toncoins. Next A will need to make a top-up for this amount
                    balanceB: toNano('0.5'), // B's initial balance in Toncoins. Next B will need to make a top-up for this amount
                    seqnoA: new BN(0), // initially 0
                    seqnoB: new BN(0)  // initially 0
                };
            
                // TODO: channel ID has to be unique for each pair of players

                let rnd
                if (isA) rnd = new RNG(`${this.myWalletAddress.toString()}-${this.theirWalletAddress.toString()}`);
                else rnd = new RNG(`${this.theirWalletAddress.toString()}-${this.myWalletAddress.toString()}`);

                let rand = rnd.nextRange(0,10000000);
                console.log(rand)

                this.channelConfig = {
                    channelId: new BN(rand),
                    addressA: isA?this.myWalletAddress:this.theirWalletAddress,
                    addressB: isA?this.theirWalletAddress:this.myWalletAddress,
                    initBalanceA: this.channelInitState.balanceA,
                    initBalanceB: this.channelInitState.balanceB
                }

                console.log(this.channelConfig);

                this.channel = tonweb.payments.createChannel({
                    ...this.channelConfig,
                    isA: isA,
                    myKeyPair: TonWeb.utils.nacl.sign.keyPair.fromSecretKey(this.secretKey),
                    hisPublicKey: TonWeb.utils.hexToBytes(publicKey),
                });

                console.log(this.channel)
                this.channel.getAddress().then((r) => {
                    this.channelAddress = r.toString(true, true, true);
                    console.log('Channel opened: ', this.channelAddress);
                    this.init(isA);
                });

            });
        });

        return this.channel;
    }
    TONChannel.prototype = {
        init: async function(isA) {
            const fromWallet = this.channel.fromWallet({
                wallet: this.myWallet,
                secretKey: this.secretKey
            });
            this.fromWallet = fromWallet;
            try {
                if (isA)
                {
                    await fromWallet.deploy().send(toNano('0.05'));
                    console.log('Channel deployed: ', this.channelAddress);
                    /*
                    console.log(await this.channel.getChannelState());
                    let data = await this.channel.getData();
                    console.log('Channel balance A: ', data.balanceA.toString());
                    console.log('Channel balance B: ', data.balanceB.toString());
                    */
                }
                // TODO: continue here - top up, init, etc
                if (isA)
                {
                    console.log('wallet A');
                    /*await fromWallet
                        .topUp({coinsA: this.channelInitState.balanceA, coinsB: new BN(0)})
                        .send(this.channelInitState.balanceA.add(toNano('0.5')));*/
                }
                else
                {
                    console.log('wallet B');
                    await fromWallet
                        .topUp({coinsA: new BN(0), coinsB: this.channelInitState.balanceB})
                        .send(this.channelInitState.balanceB.add(toNano('0.05')));
                    this.connection.userTopup();

                    localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))
                    localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))

                    updateData();
                }
                console.log('TopUp', this.channelInitState.balanceA.toString(), this.channelInitState.balanceB.toString());


                this.channelState = this.channelInitState;

            } catch (error) {
                console.error('Failed to deploy a channel: ', error);
            }
        },
        signClose: async function() {
            return TonWeb.utils.bytesToHex(
                await this.channel.signClose(this.channelState)
            );
        },
        signState: async function() {
            return TonWeb.utils.bytesToHex(
                await this.channel.signState(this.channelState)
            );
        },
        closeSigned: async function(signature) {
            signature = TonWeb.utils.hexToBytes(signature);
            if (!(await this.channel.verifyClose(this.channelState, signature))) {
                return console.error('Invalid channel close signature!');
            }
            return await this.fromWallet.close({
                ...this.channelState,
                hisSignature: signature
            }).send(toNano('0.05'));
        },
        onTopup: async function() {
            const fromWallet = this.channel.fromWallet({
                wallet: this.myWallet,
                secretKey: this.secretKey
            });
            if (this.isA)
                {
                console.log('START INIT', fromWallet)
                await fromWallet
                            .topUp({coinsA: this.channelInitState.balanceA, coinsB: new BN(0)})
                            .send(this.channelInitState.balanceA.add(toNano('0.05')));
                await fromWallet.init(this.channelInitState).send(toNano('0.05'));
                console.log('init',TonWeb.utils.fromNano(this.channelInitState.balanceA))

                localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))
                localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))

                updateData();
            }
        },
        getLoseSigendState: async function() {
            if(this.isA){
                console.log(this.channelState)
                this.channelState.balanceA = this.channelState.balanceA.sub(DELTA)
                this.channelState.balanceB = this.channelState.balanceB.add(DELTA)
                localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))
                localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))

                updateData();
            }else{
                this.channelState.balanceA = this.channelState.balanceA.add(DELTA)
                this.channelState.balanceB = this.channelState.balanceB.sub(DELTA)
                localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))
                localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))

                updateData();
            }
        },

        getWinSigendState: async function() {
            if(this.isA){
                this.channelState.balanceA = this.channelState.balanceA.add(DELTA)
                this.channelState.balanceB = this.channelState.balanceB.sub(DELTA)
                localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))
                localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))

                updateData();
            }else{
                this.channelState.balanceA = this.channelState.balanceA.sub(DELTA)
                this.channelState.balanceB = this.channelState.balanceB.add(DELTA)
                localStorage.setItem('ingameBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceB))
                localStorage.setItem('enemyBalance' ,TonWeb.utils.fromNano(this.channelInitState.balanceA))

                updateData();
            }
        }


    };

});