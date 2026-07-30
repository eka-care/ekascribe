const WaveformIcon = ({ width = 29, height = 22 }: { width?: number; height?: number }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 29 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
  >
    <rect width="29" height="22" fill="url(#pattern0_2152_100404)" />
    <defs>
      <pattern
        id="pattern0_2152_100404"
        patternContentUnits="objectBoundingBox"
        width="1"
        height="1"
      >
        <use
          href="#image0_2152_100404"
          transform="matrix(0.0145889 0 0 0.0192308 -0.0106101 0)"
        />
      </pattern>
      <image
        id="image0_2152_100404"
        width="70"
        height="52"
        preserveAspectRatio="none"
        href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAAA0CAYAAAA3xE5OAAABqElEQVR4AeyUgW6EMAxDYf//zxuWdpKHYtSqtE0mo4vOuKV1HhVfh6+QgMGEWI7DYAxGEBC2T4zBCALC9onJDub79xI5l9spTgyYfDpn/fF2/G8HE4GIvNVwtoNZ3XDrflPB4M2jWsNkmjcNDANhnan5pyxTwEQgIu8p2NMY1kI9zRkdmwJmNNSf5283DIT1bdrwbSkwEYjIG6ZyLVAKzJV32c9gBGqDMRhBQNjdJwYfO5RYL52NrKjeYF1geAPWvZuums8ZWbfs3wwmWjjyWjZdMSfKFnkqSzMYtcB/9Q1GvFmDMRhBQNg+MQYjCAi7+cSc53ne1ziv6+5lub+iDeVtBoOGeTPWGMtYnJF1S9YuMFgQG6CgKxSyonqzdoPp3aDqfIMRb85gDEYQEHapExN9RCNP9NpllwKDzhgEa4y9WeXAoHkAQUHPqilgotCRN6upN9adAgbBGARrjFWoaWDQPICgoKvVVDDVYHDe7WCiExV5HFrpN/3tYNAMg2CNsV2VAgyaBxAUdIZKAyYDDM5gMEyDtMEQDJYGwzRIGwzBYGkwTIP0DwAAAP//bQOM4QAAAAZJREFUAwC4YXhp9DmGDgAAAABJRU5ErkJggg=="
      />
    </defs>
  </svg>
);

export default WaveformIcon;
