package ec.facturacion.signer;

import org.apache.xml.security.Init;
import org.apache.xml.security.c14n.Canonicalizer;
import org.apache.xml.security.signature.ObjectContainer;
import org.apache.xml.security.signature.XMLSignature;
import org.apache.xml.security.transforms.Transforms;
import org.apache.xml.security.utils.Constants;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.StringWriter;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.Random;
import java.util.TimeZone;

public class XadesSigner {

    static {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
        Init.init();
    }

    public String sign(String xmlStr, byte[] p12Bytes, String password) throws Exception {
        // 1. Load P12 — use the default JDK provider (SunJSSE) which is most compatible
        //    with the variety of P12 files issued by the Banco Central del Ecuador.
        //    BouncyCastle is still registered for crypto operations but NOT used as
        //    the PKCS12 store provider, because BC's ks.getKey() can return null for
        //    certain P12 encodings.
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(new ByteArrayInputStream(p12Bytes), password.toCharArray());

        // Find the first alias that actually has a private key
        String alias = null;
        java.util.Enumeration<String> aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
            String a = aliases.nextElement();
            if (ks.isKeyEntry(a)) {
                alias = a;
                break;
            }
        }
        if (alias == null) {
            throw new Exception("No se encontró ninguna clave privada en el archivo .p12");
        }

        PrivateKey privateKey = (PrivateKey) ks.getKey(alias, password.toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

        if (privateKey == null) {
            throw new Exception("ks.getKey() devolvió null para el alias '" + alias + "'. Verifique la contraseña del .p12");
        }
        if (cert == null) {
            throw new Exception("No se encontró certificado X509 para el alias '" + alias + "'");
        }

        // 2. Parse XML namespace-aware
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        Document doc = dbf.newDocumentBuilder()
                .parse(new ByteArrayInputStream(xmlStr.getBytes("UTF-8")));

        // Register id/Id attributes so getElementById works for same-document refs
        registerIdAttributes(doc.getDocumentElement());

        // 3. Generate random 6-digit IDs (same pattern as TypeScript implementation)
        Random rnd = new Random();
        int sigNum  = 100000 + rnd.nextInt(900000);
        int siNum   = 100000 + rnd.nextInt(900000);
        int spRefNum = 100000 + rnd.nextInt(900000);
        int certNum = 100000 + rnd.nextInt(900000);
        int refNum  = 100000 + rnd.nextInt(900000);
        int svNum   = 100000 + rnd.nextInt(900000);
        int objNum  = 100000 + rnd.nextInt(900000);
        int spNum   = 100000 + rnd.nextInt(900000);

        String sigId    = "Signature" + sigNum;
        String siId     = "Signature-SignedInfo" + siNum;
        String spRefId  = "SignedPropertiesID" + spRefNum;
        String keyInfoId = "Certificate" + certNum;
        String refId    = "Reference-ID-" + refNum;
        String svId     = "SignatureValue" + svNum;
        String objId    = sigId + "-Object" + objNum;
        String spId     = sigId + "-SignedProperties" + spNum;

        // 4. Certificate data
        byte[] certEncoded = cert.getEncoded();
        MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
        String certDigestB64 = Base64.getEncoder().encodeToString(sha1.digest(certEncoded));

        // IssuerName: RFC 2253 reversed order (CN first, C last),
        // matching the TypeScript [...attributes].reverse() behaviour
        String issuerDN = cert.getIssuerX500Principal().getName("RFC2253");
        String serialDec = cert.getSerialNumber().toString();

        // 5. Signing time in Ecuador timezone
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX");
        sdf.setTimeZone(TimeZone.getTimeZone("America/Guayaquil"));
        String signingTime = sdf.format(new Date());

        // 6. Create XMLSignature (RSA-SHA1, C14N without comments)
        XMLSignature sig = new XMLSignature(doc, "",
                XMLSignature.ALGO_ID_SIGNATURE_RSA_SHA1,
                Canonicalizer.ALGO_ID_C14N_OMIT_COMMENTS);
        sig.setId(sigId);

        // Set SignedInfo Id via DOM (Santuario doesn't expose a setter)
        Element signedInfoEl = sig.getSignedInfo().getElement();
        signedInfoEl.setAttributeNS(null, "Id", siId);
        signedInfoEl.setIdAttribute("Id", true);

        // Append signature to document root BEFORE computing reference digests
        doc.getDocumentElement().appendChild(sig.getElement());

        // 7. Build QualifyingProperties DOM and attach to Object
        Element qualProps = buildQualifyingProperties(doc, sigId, spId, refId,
                signingTime, certDigestB64, issuerDN, serialDec);

        ObjectContainer objContainer = new ObjectContainer(doc);
        objContainer.setId(objId);
        objContainer.appendChild(qualProps);
        sig.appendObject(objContainer);

        // Register the SignedProperties Id so Santuario can resolve #spId
        NodeList spNodes = doc.getElementsByTagNameNS(
                "http://uri.etsi.org/01903/v1.3.2#", "SignedProperties");
        for (int i = 0; i < spNodes.getLength(); i++) {
            Element el = (Element) spNodes.item(i);
            el.setIdAttribute("Id", true);
        }

        // 8. Add References in order:
        //    1) SignedProperties  (Type = XAdES SignedProperties)
        //    2) KeyInfo / Certificate
        //    3) comprobante (with enveloped-signature transform)
        sig.addDocument("#" + spId, null, Constants.ALGO_ID_DIGEST_SHA1,
                spRefId, "http://uri.etsi.org/01903#SignedProperties");

        sig.addDocument("#" + keyInfoId, null, Constants.ALGO_ID_DIGEST_SHA1,
                null, null);

        Transforms transforms = new Transforms(doc);
        transforms.addTransform(Transforms.TRANSFORM_ENVELOPED_SIGNATURE);
        sig.addDocument("#comprobante", transforms, Constants.ALGO_ID_DIGEST_SHA1,
                refId, null);

        // 9. KeyInfo: X509Certificate + RSAKeyValue
        sig.addKeyInfo(cert);
        sig.getKeyInfo().addKeyValue(cert.getPublicKey());
        sig.getKeyInfo().setId(keyInfoId);

        // Register KeyInfo Id
        sig.getKeyInfo().getElement().setIdAttribute("Id", true);

        // Set SignatureValue Id before signing
        Element sigValueEl = (Element) sig.getElement()
                .getElementsByTagNameNS(Constants.SignatureSpecNS, "SignatureValue").item(0);
        if (sigValueEl != null) {
            sigValueEl.setAttributeNS(null, "Id", svId);
            sigValueEl.setIdAttribute("Id", true);
        }

        // CRITICAL: declare xmlns:etsi on ds:Signature BEFORE signing.
        //
        // The Java Transformer promotes xmlns:etsi from etsi:QualifyingProperties up
        // to ds:Signature in the serialized output (because ds:Signature is the
        // nearest common ancestor of all etsi: elements).  This means the submitted
        // XML will have xmlns:etsi on ds:Signature, so the SRI C14N of ds:SignedInfo
        // will include xmlns:etsi in the bytes it verifies against.
        //
        // If we do NOT declare it before sign(), Santuario computes the C14N of
        // ds:SignedInfo WITHOUT xmlns:etsi → bytes signed ≠ bytes verified → FIRMA INVALIDA.
        //
        // Declaring it here BEFORE sign() makes Santuario include xmlns:etsi in the
        // C14N of ds:SignedInfo when it builds the RSA signature → both sides match.
        sig.getElement().setAttributeNS(
                "http://www.w3.org/2000/xmlns/",
                "xmlns:etsi",
                "http://uri.etsi.org/01903/v1.3.2#"
        );

        // 10. Sign — Santuario computes all reference digests then signs SignedInfo
        sig.sign(privateKey);

        // 11. Serialize to String (UTF-8, with XML declaration)
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
        StringWriter sw = new StringWriter();
        transformer.transform(new DOMSource(doc), new StreamResult(sw));
        return sw.toString();
    }

    /** Build etsi:QualifyingProperties as a DOM subtree (not yet attached to a document). */
    private Element buildQualifyingProperties(Document doc,
            String sigId, String spId, String refId,
            String signingTime, String certDigestB64,
            String issuerDN, String serialDec) {

        final String etsi = "http://uri.etsi.org/01903/v1.3.2#";
        final String ds   = "http://www.w3.org/2000/09/xmldsig#";

        Element qualProps = doc.createElementNS(etsi, "etsi:QualifyingProperties");
        qualProps.setAttribute("Target", sigId);

        Element signedProps = doc.createElementNS(etsi, "etsi:SignedProperties");
        signedProps.setAttribute("Id", spId);
        qualProps.appendChild(signedProps);

        Element signedSigProps = doc.createElementNS(etsi, "etsi:SignedSignatureProperties");
        signedProps.appendChild(signedSigProps);

        Element signingTimeEl = doc.createElementNS(etsi, "etsi:SigningTime");
        signingTimeEl.setTextContent(signingTime);
        signedSigProps.appendChild(signingTimeEl);

        Element signingCertEl = doc.createElementNS(etsi, "etsi:SigningCertificate");
        signedSigProps.appendChild(signingCertEl);

        Element certEl = doc.createElementNS(etsi, "etsi:Cert");
        signingCertEl.appendChild(certEl);

        Element certDigestEl = doc.createElementNS(etsi, "etsi:CertDigest");
        certEl.appendChild(certDigestEl);

        // Explicit closing tag is required for C14N (no self-closing)
        Element digestMethod = doc.createElementNS(ds, "ds:DigestMethod");
        digestMethod.setAttribute("Algorithm", "http://www.w3.org/2000/09/xmldsig#sha1");
        certDigestEl.appendChild(digestMethod);

        Element digestValue = doc.createElementNS(ds, "ds:DigestValue");
        digestValue.setTextContent(certDigestB64);
        certDigestEl.appendChild(digestValue);

        Element issuerSerialEl = doc.createElementNS(etsi, "etsi:IssuerSerial");
        certEl.appendChild(issuerSerialEl);

        Element x509IssuerName = doc.createElementNS(ds, "ds:X509IssuerName");
        x509IssuerName.setTextContent(issuerDN);
        issuerSerialEl.appendChild(x509IssuerName);

        Element x509Serial = doc.createElementNS(ds, "ds:X509SerialNumber");
        x509Serial.setTextContent(serialDec);
        issuerSerialEl.appendChild(x509Serial);

        Element signedDataObjProps = doc.createElementNS(etsi, "etsi:SignedDataObjectProperties");
        signedProps.appendChild(signedDataObjProps);

        Element dataObjFormat = doc.createElementNS(etsi, "etsi:DataObjectFormat");
        dataObjFormat.setAttribute("ObjectReference", "#" + refId);
        signedDataObjProps.appendChild(dataObjFormat);

        Element description = doc.createElementNS(etsi, "etsi:Description");
        description.setTextContent("contenido comprobante");
        dataObjFormat.appendChild(description);

        Element mimeType = doc.createElementNS(etsi, "etsi:MimeType");
        mimeType.setTextContent("text/xml");
        dataObjFormat.appendChild(mimeType);

        return qualProps;
    }

    /** Recursively register id/Id attributes as XML ID types so getElementById works. */
    private void registerIdAttributes(Element element) {
        if (element.hasAttribute("Id")) {
            element.setIdAttribute("Id", true);
        }
        if (element.hasAttribute("id")) {
            element.setIdAttribute("id", true);
        }
        NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child instanceof Element) {
                registerIdAttributes((Element) child);
            }
        }
    }
}
