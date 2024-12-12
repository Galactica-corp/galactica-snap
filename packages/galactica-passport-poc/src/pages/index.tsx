import type {
  ZkCertProof,
  MerkleProofUpdateRequestParams,
  MerkleProofURLUpdateParams,
  ProverLink,
} from '@galactica-net/snap-api';
import {
  clearStorage,
  deleteZkCert,
  importZkCert,
  exportZkCert,
  generateZKProof,
  getHolderCommitment,
  ZkCertStandard,
  updateMerkleProof,
  updateMerkleProofURL,
  benchmarkZKPGen,
} from '@galactica-net/snap-api';

import { ethers } from 'ethers';
import { useContext } from 'react';
import styled from 'styled-components';
import {
  shouldDisplayReconnectButton,
  formatVerificationSBTs,
  getUserAddress,
  handleSnapConnectClick,
  handleWalletConnectClick,
  showVerificationSBTs,
} from '../utils';
import {
  ConnectSnapButton,
  InstallFlaskButton,
  ReconnectButton,
  Card,
  GeneralButton,
  SelectAndImportButton,
  ConnectWalletButton,
} from '../../../galactica-dapp/src/components';
import mockDAppABI from '../../../galactica-dapp/src/config/abi/MockDApp.json';
import twitterSBTManagerABI from '../../../galactica-dapp/src/config/abi/SBTManager.json';
import addresses from '../../../galactica-dapp/src/config/addresses';
import {
  defaultSnapOrigin,
  zkKYCAgeProofPublicInputDescriptions,
  twitterFollowersCountProofPublicInputDescriptions
} from '../../../galactica-dapp/src/config/snap';
import {
  MetamaskActions,
  MetaMaskContext,
} from '../../../galactica-dapp/src/hooks';
import { getCurrentBlockTime } from '../../../galactica-dapp/src/utils/metamask';
import {
  processProof,
  processPublicSignals
} from '../../../galactica-dapp/src/utils/proofProcessing';
import {
  getProver,
  prepareProofInput,
} from '../../../galactica-dapp/src/utils/zkp';
// import benchmarkInput from '../benchmark/exampleMockDApp.json';
import benchmarkInput from '../benchmark/input.json';


const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  margin-top: 7.6rem;
  margin-bottom: 7.6rem;
  ${({ theme }) => theme.mediaQueries.small} {
    padding-left: 2.4rem;
    padding-right: 2.4rem;
    margin-top: 2rem;
    margin-bottom: 2rem;
    width: auto;
  }
`;

const Heading = styled.h1`
  margin-top: 0;
  margin-bottom: 2.4rem;
  text-align: center;
`;

const Span = styled.span`
  color: ${(props) => props.theme.colors.primary.default};
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.large};
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 0;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const CardContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 64.8rem;
  width: 100%;
  height: 100%;
  margin-top: 1.5rem;
`;

const Notice = styled.div`
  background-color: ${({ theme }) => theme.colors.background.alternative};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  color: ${({ theme }) => theme.colors.text.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;

  & > * {
    margin: 0;
  }
  ${({ theme }) => theme.mediaQueries.small} {
    margin-top: 1.2rem;
    padding: 1.6rem;
  }
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error.muted};
  border: 1px solid ${({ theme }) => theme.colors.error.default};
  color: ${({ theme }) => theme.colors.error.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

const InfoMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.info.muted};
  border: 1px solid ${({ theme }) => theme.colors.info.default};
  color: ${({ theme }) => theme.colors.info.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);

  /**
   * Converts response object from Snap to string to show to the user.
   *
   * @param res - Object returned by Snap.
   */
  const communicateResponse = (res: any) => {
    const msg = res.message || JSON.stringify(res);

    console.log('Response from snap', msg);
    dispatch({ type: MetamaskActions.SetInfo, payload: `Response from snap: ${msg} ` });
  }

  const handleSnapCallClick = async (method: (snapOrigin: string) => Promise<any>) => {
    try {
      console.log('sending request to snap...');
      const res = await method(defaultSnapOrigin);
      communicateResponse(res);
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const handleExportClick = async () => {
    try {
      console.log('sending request to snap...');
      const res = await exportZkCert({}, defaultSnapOrigin);
      console.log('Response from snap', JSON.stringify(res));
      dispatch({ type: MetamaskActions.SetInfo, payload: `Downloading zkCert...` });

      // save to file
      const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
        JSON.stringify(res, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = "zkCert.json";
      link.click();
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const getHolderCommitmentClick = async () => {
    try {
      console.log('sending request to snap...');
      const holderCommitmentData = await getHolderCommitment(defaultSnapOrigin);
      console.log('Response from snap', JSON.stringify(holderCommitmentData));
      dispatch({ type: MetamaskActions.SetInfo, payload: `Your holder commitent: ${holderCommitmentData.holderCommitment}` });

      // save to file as placeholder
      // In a non-test environment, the holder commitment would be passed to the guardian directly
      const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
        JSON.stringify(holderCommitmentData, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = "holderCommitment.json";
      link.click();
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const importSelectedZkCert = async (fileContent: string) => {
    try {
      const parsedFile = JSON.parse(fileContent);

      console.log('sending request to snap...');
      const res = await importZkCert({ encryptedZkCert: parsedFile }, defaultSnapOrigin);
      communicateResponse(res);
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const updateSelectedMerkleProof = async (fileContent: string) => {
    try {
      const parsedFile = JSON.parse(fileContent);
      const merkleUpdates: MerkleProofUpdateRequestParams = {
        updates: [{
          registryAddr: addresses.zkKYCRegistry,
          proof: parsedFile,
        }]
      };

      console.log('sending request to snap...');
      const res = await updateMerkleProof(merkleUpdates, defaultSnapOrigin);
      communicateResponse(res);
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const updateMerkleProofURLClick = async () => {
    try {
      const update: MerkleProofURLUpdateParams = {
        url: 'http://localhost:8480/v1/galactica/',
      };

      console.log('sending request to snap...');
      const res = await updateMerkleProofURL(update, defaultSnapOrigin);
      communicateResponse(res);
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const bigKYCProofGenClick = async () => {
    try {
      dispatch({ type: MetamaskActions.SetInfo, payload: `ZK proof generation in Snap running...` });

      const dateNow = new Date();
      const ageProofInputs = {
        // specific inputs to prove that the holder is at least 18 years old
        currentYear: dateNow.getUTCFullYear().toString(),
        currentMonth: (dateNow.getUTCMonth() + 1).toString(),
        currentDay: dateNow.getUTCDate().toString(),
        ageThreshold: '18',
      };

      const proofInput = await prepareProofInput(addresses.mockDApp, addresses.galacticaInstitutions, ageProofInputs);
      const res: any = await generateZKProof({
        input: proofInput,
        prover: await getProver("provers/exampleMockDApp.json"),
        requirements: {
          zkCertStandard: ZkCertStandard.ZkKYC,
          registryAddress: addresses.zkKYCRegistry,
        },
        userAddress: getUserAddress(),
        description: "This proof discloses that you hold a valid zkKYC and that your age is at least 18.",
        publicInputDescriptions: zkKYCAgeProofPublicInputDescriptions,
        zkInputRequiresPrivKey: true,
      }, defaultSnapOrigin);
      console.log('Response from snap', JSON.stringify(res));
      const zkp = res as ZkCertProof;

      dispatch({ type: MetamaskActions.SetInfo, payload: `Proof generation successful.` });
      dispatch({ type: MetamaskActions.SetProofData, payload: zkp });

      // send proof directly on chain
      let [a, b, c] = processProof(zkp.proof);
      let publicInputs = processPublicSignals(zkp.publicSignals);

      console.log(`Sending proof for on-chain verification...`);
      // this is the on-chain function that requires a ZKP
      //@ts-ignore https://github.com/metamask/providers/issues/200
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      // get contracts
      const exampleDAppSC = new ethers.Contract(addresses.mockDApp, mockDAppABI.abi, signer);
      let tx = await exampleDAppSC.airdropToken(1, a, b, c, publicInputs);
      console.log("tx", tx);
      dispatch({ type: MetamaskActions.SetInfo, payload: `Sent proof for on-chain verification` });
      const receipt = await tx.wait();
      console.log("receipt", receipt);
      dispatch({ type: MetamaskActions.SetInfo, payload: `Verified on-chain` });

      console.log(`Updating verification SBTs...`);
      dispatch({ type: MetamaskActions.SetVerificationSBT, payload: await showVerificationSBTs(addresses.sbtIssuingContracts, addresses.zkKYCRegistry) });
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const twitterProofGenClick = async () => {
    try {
      dispatch({
        type: MetamaskActions.SetInfo,
        payload: `ZK proof generation in Snap running...`,
      });

      const proofInput = {
        currentTime: await getCurrentBlockTime(),
        // specific inputs to prove that the twitterZkCertificate with at least 100 followers
        followersCountThreshold: '100',
      };

      const res: any = await generateZKProof(
        {
          input: proofInput,
          prover: await getProver(
            'provers/twitterFollowersCountProof.json',
          ),
          requirements: {
            zkCertStandard: ZkCertStandard.Twitter,
            // eslint-disable-next-line import/no-named-as-default-member
            registryAddress: addresses.twitterZkCertificateRegistry,
          },
          userAddress: getUserAddress(),
          description:
            'This ZK proof shows: You have over 100 followers on X.',
          publicInputDescriptions:
            twitterFollowersCountProofPublicInputDescriptions,
          zkInputRequiresPrivKey: false,
        },
        defaultSnapOrigin,
      );
      console.log('Response from snap', JSON.stringify(res));
      const zkp = res as ZkCertProof;

      dispatch({
        type: MetamaskActions.SetInfo,
        payload: `Proof generation successful.`,
      });
      dispatch({ type: MetamaskActions.SetProofData, payload: zkp });

      // eslint-disable-next-line id-length
      const [a, b, c] = processProof(zkp.proof);
      const publicInputs = processPublicSignals(zkp.publicSignals);

      console.log(`Sending proof for on-chain verification...`);
      // @ts-expect-error https://github.com/metamask/providers/issues/200
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const twitterSBTManager = new ethers.Contract(
        // eslint-disable-next-line import/no-named-as-default-member
        addresses.twitterSBTManager,
        twitterSBTManagerABI.abi,
        signer,
      );
      let tx = await twitterSBTManager.mintSBT(
        0, // index for followers count > 100
        a,
        b,
        c,
        publicInputs,
      );
      console.log('tx', tx);
      dispatch({
        type: MetamaskActions.SetInfo,
        payload: `Sent proof for on-chain verification`,
      });
      const receipt = await tx.wait();
      console.log('receipt', receipt);
      dispatch({ type: MetamaskActions.SetInfo, payload: `Verified on-chain` });
    } catch (e) {
      console.log('found an error');
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const benchmarkClick = async () => {
    try {
      dispatch({ type: MetamaskActions.SetInfo, payload: `Benchmark running...` });

      const startTime = new Date();
      // const prover = await getProver("provers/exampleMockDApp.json");
      // const prover = await getProver("provers/reputationExperiment.json");
      const prover: ProverLink = {
        url: 'http://localhost:8001/provers/reputationExperiment/',
        hash: 'df771e1905fe5b9936d3362cfae7b772',
      }

      const res: any = await benchmarkZKPGen({
        input: benchmarkInput,
        prover: prover,
      }, defaultSnapOrigin);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log('Response from snap', JSON.stringify(res));

      console.log(`Total ZKP generation time: ${duration}ms`);
      console.log(`Prover size: ${JSON.stringify(prover).length / 1024 / 1024} MB`);

      dispatch({ type: MetamaskActions.SetInfo, payload: `Proof generation successful.` });
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  return (
    <Container>
      <Heading>
        Welcome to the <Span>Galactica zkKYC</Span> proof of concept
      </Heading>
      <Subtitle>
        Galactica dApp features
      </Subtitle>
      <CardContainer>
        {state.error && (
          <ErrorMessage>
            <b>An error happened:</b> {state.error.message}
          </ErrorMessage>
        )}
        {state.info && (
          <InfoMessage>
            {state.info}
          </InfoMessage>
        )}
        {!state.isFlask && (
          <Card
            content={{
              title: 'Install',
              description:
                'Snaps is pre-release software only available in MetaMask Flask, a canary distribution for developers with access to upcoming features. This test front-end uses flask so that you can connect to locally built Snaps.',
              button: <InstallFlaskButton />,
            }}
            fullWidth
          />
        )}
        {/* {(
          <Card
            content={{
              title: 'Snap selector',
              description:
                `What Snap ID to connect with?`,
              button: (
                <div onChange={async (event) => await changeSnapSelection(event, dispatch)}>
                  <input type="radio" value={defaultSnapOrigin} name="snapIdRadio" /> {defaultSnapOrigin} <br></br>
                  <input type="radio" value={npmSnapOrigin} name="snapIdRadio" /> {npmSnapOrigin}
                </div>
              ),
            }}
            disabled={!state.isFlask}
          />
        )} */}
        {!state.installedSnap && (
          <Card
            content={{
              title: 'Connect to Galactica Snap',
              description:
                'Get started by connecting to and installing the Galactica proof generation snap.',
              button: (
                <ConnectSnapButton
                  onClick={async () => await handleSnapConnectClick(dispatch)}
                  disabled={!state.isFlask}
                  text={"Connect Snap"}
                />
              ),
            }}
            disabled={!state.isFlask}
          />
        )}
        {shouldDisplayReconnectButton(state.installedSnap) && (
          <Card
            content={{
              title: 'Reconnect Snap',
              description:
                `You can reconnect to update the snap after making changes. Connected to snap "${state.installedSnap?.id}"`,
              button: (
                <ReconnectButton
                  onClick={async () => await handleSnapConnectClick(dispatch)}
                  disabled={!state.installedSnap}
                />
              ),
            }}
            disabled={!state.installedSnap}
          />
        )}
        {state.isFlask && state.installedSnap && (
          <Card
            content={{
              title: 'Connect Wallet',
              description:
                `Standard Metamask connection to send transactions. Connected to address "${state.signer}"`,
              button: (
                <ConnectWalletButton
                  onClick={async () => await handleWalletConnectClick(dispatch)}
                  id={"connectMM"}
                />
              ),
            }}
            disabled={!state.isFlask}
          />
        )}
        {/* <Card
          content={{
            title: 'Generate age proof',
            description:
              'Call Metamask Snap to generate a simple ZK proof.',
            button: (
              <GeneralButton
                onClick={handleSimpleProofClick}
                disabled={false}
                text="Generate"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        /> */}
        <Card
          content={{
            title: 'zkKYC + age proof',
            description:
              '1. Call Metamask Snap to generate a proof that you hold a zkKYC and are above 18 years old. 2. Send proof tx for on-chain verification.',
            button: (
              <GeneralButton
                onClick={bigKYCProofGenClick}
                disabled={false}
                text="Generate & Submit"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />

        <Card
          content={{
            title: 'twitter + follower threshold proof',
            description:
              '1. Call Metamask Snap to generate a proof that you hold a twitter ZkCertificate and has more than a certain number of followers. 2. Send proof tx for on-chain verification.',
            button: (
              <GeneralButton
                onClick={twitterProofGenClick}
                disabled={false}
                text="Generate & Submit"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        {/* <Notice>
          <p>
            Please note that the <b>snap.manifest.json</b> and{' '}
            <b>package.json</b> must be located in the server root directory and
            the bundle must be hosted at the location specified by the location
            field.
          </p>
        </Notice> */}
      </CardContainer>
      <br />
      <Subtitle>
        Manage zkCertificate storage (part of Galactica passport website)
      </Subtitle>
      <CardContainer>
        <Card
          content={{
            title: 'Show valid Verification SBTs',
            description: formatVerificationSBTs(state.verificationSbts, state.guardianNameMap),
            button: (
              <GeneralButton
                onClick={async () => dispatch({ type: MetamaskActions.SetVerificationSBT, payload: await showVerificationSBTs(addresses.sbtIssuingContracts, addresses.zkKYCRegistry) })}
                disabled={false}
                text="Query"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Clear storage',
            description:
              'Asks the Metamask snap to clear the zkCertificate and holder storage.',
            button: (
              <GeneralButton
                onClick={() => handleSnapCallClick(clearStorage)}
                disabled={false}
                text="Clear"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Import zkCert',
            description:
              'Uploads a zkCert file into the Metamask snap storage.',
            button: (
              <SelectAndImportButton
                fileSelectAction={importSelectedZkCert}
                disabled={false}
                text="Select & Import"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Export zkCert',
            description:
              'Downloads zkCert files from the Metamask snap storage.',
            button: (
              <GeneralButton
                onClick={handleExportClick}
                disabled={false}
                text="Export"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Delete zkCert',
            description:
              'Delete a zkCert from the Metamask snap storage.',
            button: (
              <GeneralButton
                onClick={() =>
                  handleSnapCallClick(() => deleteZkCert({}, defaultSnapOrigin))
                }
                disabled={false}
                text="Export"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Update Merkle Proof',
            description:
              'Uploads a new Merkle Proof for a zkCert.',
            button: (
              <SelectAndImportButton
                fileSelectAction={updateSelectedMerkleProof}
                disabled={false}
                text="Select & Import"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Update Merkle Proof Indexer URL',
            description:
              'Changes indexer url for testing using localhost as default.',
            button: (
              <GeneralButton
                onClick={updateMerkleProofURLClick}
                disabled={false}
                text="Change URL"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'ZKP Generation Benchmark',
            description:
              'Benchmark the duration of generating a ZK proof inside the snap.',
            button: (
              <GeneralButton
                onClick={benchmarkClick}
                disabled={false}
                text="Run"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
      </CardContainer>
      <br />
      <Subtitle>
        Creating zkKYC (part of zkKYC provider website)
      </Subtitle>
      <CardContainer>
        <Card
          content={{
            title: 'Prepare holder commitment',
            description:
              'To issue a zkCert, the provider needs your holder commitment. It ties the zkCert to your holding address without revealing the address to the provider.',
            button: (
              <GeneralButton
                onClick={getHolderCommitmentClick}
                disabled={false}
                text="Prepare"
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
      </CardContainer>
    </Container>
  );
};

export default Index;
